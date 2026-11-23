import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { FIRST_RULE_HOUR, nextAction, type RuleAction } from '../domain/account-rules.js';
import { ukDay, ukHour, type AccountState } from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';
import type { PaymentFacts } from './ports/payment-facts.js';
import { deliverAccountEmail, type AccountEmailDeps } from './account-emails.js';

export interface AccountRuleDeps extends AccountEmailDeps {
  readonly states: AccountStateRepository;
  readonly ids: IdGenerator;
  /** Whether a company has payment details on file, so a finished free period becomes active rather than overdue. Absent: none do. */
  readonly payments?: PaymentFacts | undefined;
  /** Runs one company's work in its own data scope (WagonWise staff's), so one company's failure does not undo another's. */
  readonly scoped: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface AccountRuleOutcome {
  /** Companies moved to overdue or paused. */
  readonly moved: number;
  /** Emails written to a company. */
  readonly emailed: number;
  /** Emails that had no one to go to (nobody at the company holds billing or user management). */
  readonly nobodyToWrite: number;
  /** Companies that failed, in the run's own log; the rest were still done. */
  readonly failed: number;
}

const NOTHING: AccountRuleOutcome = { moved: 0, emailed: 0, nobodyToWrite: 0, failed: 0 };

/**
 * The automatic rules (docs/company-account-states-scope.md, item 3). Run hourly; safe to run as often as you like, since every
 * email is claimed in the log first and a move only happens when the dates say so. For each company that is on a trial or overdue
 * (and has no hold), it does what `nextAction` says: sends the email, or moves the company to overdue or paused. After a move it asks
 * again, so a company that has just become overdue is written to in the same pass, and one that has just been paused gets the
 * paused email. Every move is logged as made by the system and the owner is sent a notice of it.
 *
 * Nothing is done before 7am UK, so an email never goes in the night. Nothing is done at all while the setting is `off`.
 *
 * A pause made by hand is not emailed by this: the owner did it and can write when they like. A company the owner made overdue by hand
 * is treated like one the rules made overdue (written to, then paused after the grace period), so a test company should have the hold.
 */
export async function runAccountRules(deps: AccountRuleDeps): Promise<AccountRuleOutcome> {
  const now = deps.clock.now();
  if (ukHour(now) < FIRST_RULE_HOUR) return NOTHING;
  const settings = await deps.scoped(() => deps.states.getSettings());
  if (settings.automation === 'off') return NOTHING;

  const candidates = (await deps.scoped(() => deps.states.getAll())).filter(
    (s) => !s.hold && (s.status === 'trial' || s.status === 'overdue'),
  );
  const today = ukDay(now);

  let moved = 0;
  let emailed = 0;
  let nobodyToWrite = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const done = await deps.scoped(() => processCompany(deps, candidate.companyId, today));
      moved += done.moved;
      emailed += done.emailed;
      nobodyToWrite += done.nobodyToWrite;
    } catch {
      failed += 1;
    }
  }
  return { moved, emailed, nobodyToWrite, failed };
}

async function processCompany(
  deps: AccountRuleDeps,
  companyId: CompanyId,
  today: string,
): Promise<Omit<AccountRuleOutcome, 'failed'>> {
  let moved = 0;
  let emailed = 0;
  let nobodyToWrite = 0;
  const settings = await deps.states.getSettings();

  // At most trial -> overdue -> paused, with an email after each: a few steps, never a loop.
  for (let step = 0; step < 4; step += 1) {
    const state = await deps.states.get(companyId);
    if (state === null) break;
    // Only a trial that has run out cares whether payment details are on file.
    const hasDetails =
      state.status === 'trial' && deps.payments !== undefined
        ? await deps.payments.hasPaymentMethod(companyId)
        : false;
    const action = nextAction(state, settings, today, hasDetails);
    if (action === null) break;

    if (action.type === 'email') {
      const result = await deliverAccountEmail(deps, companyId, action.kind);
      if (result.ok) {
        if (!result.value.alreadySent) emailed += 1;
      } else if (result.error.tag === 'NoRecipients') {
        nobodyToWrite += 1;
      }
      // Whatever came of it, the next thing waits for the next pass (an email is the last step of one).
      break;
    }

    await applyMove(deps, state, action);
    moved += 1;
    // A trial that became active (billing starts) has nothing more to do this pass.
    if (action.to === 'active') break;
    if (action.to === 'paused') {
      const result = await deliverAccountEmail(deps, companyId, 'paused');
      if (result.ok && !result.value.alreadySent) emailed += 1;
      if (!result.ok && result.error.tag === 'NoRecipients') nobodyToWrite += 1;
      break;
    }
  }
  return { moved, emailed, nobodyToWrite };
}

/** Moves a company as the system, not a person: saved, logged with no staff member, and the owner told. Shared with the payment facts. */
export async function applyMove(
  deps: Pick<AccountRuleDeps, 'states' | 'ids' | 'clock' | 'companies' | 'ownerNotice'>,
  state: AccountState,
  action: Extract<RuleAction, { type: 'move' }>,
): Promise<void> {
  const now = deps.clock.now();
  const next: AccountState = {
    ...state,
    status: action.to,
    trialEndsOn: null,
    overdueSince: action.to === 'overdue' ? now : null,
    pausedAt: action.to === 'paused' ? now : null,
    note: action.note,
  };
  await deps.states.save(next);
  await deps.states.appendMove({
    id: deps.ids.newId(),
    companyId: state.companyId,
    from: state.status,
    to: action.to,
    byStaffId: null,
    note: action.note,
    at: now,
  });

  if (deps.ownerNotice !== undefined) {
    const company = await deps.companies.findById(state.companyId);
    const name = company?.name ?? 'A company';
    try {
      await deps.ownerNotice.send(
        `WagonWise moved ${name} to ${action.to} by itself`,
        [
          `${name} was moved from ${state.status} to ${action.to} by the automatic rules.`,
          '',
          action.note,
          '',
          'To undo it, open the Companies page, then Account for this company. To keep a company out of the rules, tick "Never pause this company".',
        ].join('\n'),
      );
    } catch {
      // The move is made and logged; the notice is a courtesy.
    }
  }
}
