import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  ACCOUNT_EMAIL_LABEL,
  buildAccountEmail,
  stateFor,
  type AccountEmailKind,
} from '../domain/account-emails.js';
import { trialEndsOn as addDays, ukDay } from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor, StaffAccount } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import type { CompanyNotFound } from './account-state.js';
import type { AccountEmailLog, AccountMailer, OwnerNotice } from './ports/account-emails.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';
import type { CompanyRepository } from './ports/company-repository.js';
import type { StaffAccountRepository } from './ports/staff-account-repository.js';

/** The company is not in the state this email is about (for example "paused" for a company that is not). */
export type WrongState = TaggedError<'WrongState'>;
/** Nobody at the company holds billing or user management, so there is nobody to write to. */
export type NoRecipients = TaggedError<'NoRecipients'>;
/** Every send failed. Nothing is logged as sent, so it can be tried again. */
export type EmailFailed = TaggedError<'EmailFailed'>;

export interface AccountEmailDeps {
  readonly states: Pick<AccountStateRepository, 'get' | 'getSettings'>;
  readonly companies: Pick<CompanyRepository, 'findById'>;
  readonly accounts: Pick<StaffAccountRepository, 'listByCompany' | 'findById'>;
  readonly emailLog: AccountEmailLog;
  readonly mailer: AccountMailer;
  /** The owner's alert address; absent when none is set. */
  readonly ownerNotice?: OwnerNotice | undefined;
  /** The portal's address, for the link to the plan page. */
  readonly dashboardUrl: string | undefined;
  readonly clock: Clock;
}

export interface AccountEmailOutcome {
  /** People written to. */
  readonly sent: number;
  /** True when this email had already gone for this occasion, so nothing was sent now. */
  readonly alreadySent: boolean;
}

interface Recipient {
  readonly name: string;
  readonly email: string;
}

/** The people who hold the company's billing; if nobody does, those who manage its users. */
function recipientsOf(accounts: readonly StaffAccount[]): Recipient[] {
  const fleet = accounts.flatMap((a) => (a.kind === 'fleet' ? [a] : []));
  const billing = fleet.filter((a) => a.privileges.includes('manage_billing'));
  const chosen =
    billing.length > 0 ? billing : fleet.filter((a) => a.privileges.includes('manage_users'));
  return chosen.map((a) => ({ name: a.name, email: a.email }));
}

/**
 * Writes to a company's billing people about its account, once for each occasion. The occasion is the day the free period ends, or
 * the UK day the company went overdue or was paused, so a company that goes overdue a second time is written to a second time and the
 * same occasion never twice. The log row is written before anything is sent and given back if every send fails. The owner is sent
 * a short notice of each one (when an alert address is set). This is what the hand-made send and the automatic task both use.
 */
export async function deliverAccountEmail(
  deps: AccountEmailDeps,
  companyId: CompanyId,
  kind: AccountEmailKind,
): Promise<Result<AccountEmailOutcome, CompanyNotFound | WrongState | NoRecipients | EmailFailed>> {
  const [state, company] = await Promise.all([
    deps.states.get(companyId),
    deps.companies.findById(companyId),
  ]);
  if (state === null || company === null) return err({ tag: 'CompanyNotFound' });
  if (state.status !== stateFor(kind)) return err({ tag: 'WrongState' });

  const now = deps.clock.now();
  const today = ukDay(now);
  const occasion =
    state.status === 'trial'
      ? state.trialEndsOn
      : ukDay(state.status === 'overdue' ? (state.overdueSince ?? now) : (state.pausedAt ?? now));
  if (occasion === null) return err({ tag: 'WrongState' });

  const recipients = recipientsOf(await deps.accounts.listByCompany(companyId));
  if (recipients.length === 0) return err({ tag: 'NoRecipients' });

  if (!(await deps.emailLog.claim(companyId, kind, occasion, now))) {
    return ok({ sent: 0, alreadySent: true });
  }

  const settings = await deps.states.getSettings();
  const reached: string[] = [];
  for (const person of recipients) {
    const email = buildAccountEmail({
      kind,
      recipientName: person.name,
      companyName: company.name,
      today,
      trialEndsOn: state.trialEndsOn,
      overdueSince: state.overdueSince === null ? null : ukDay(state.overdueSince),
      graceDays: settings.graceDays,
      hold: state.hold,
      dashboardUrl: deps.dashboardUrl,
    });
    try {
      await deps.mailer.send(person.email, email.subject, email.text);
      reached.push(person.email);
    } catch {
      // The others are still written to; if nobody is reached the row is given back below.
    }
  }
  if (reached.length === 0) {
    await deps.emailLog.release(companyId, kind, occasion);
    return err({ tag: 'EmailFailed' });
  }
  await deps.emailLog.recordSent(companyId, kind, occasion, reached.length);

  if (deps.ownerNotice !== undefined) {
    try {
      await deps.ownerNotice.send(
        `WagonWise wrote to ${company.name}: ${ACCOUNT_EMAIL_LABEL[kind]}`,
        [
          `${company.name} was sent the "${ACCOUNT_EMAIL_LABEL[kind]}" email on ${today}.`,
          '',
          `Sent to: ${reached.join(', ')}`,
          ...(reached.length < recipients.length
            ? [`Could not reach ${recipients.length - reached.length} of ${recipients.length}.`]
            : []),
        ].join('\n'),
      );
    } catch {
      // The notice is a courtesy; the email to the company has gone.
    }
  }
  return ok({ sent: reached.length, alreadySent: false });
}

/** A sample of the email for a company, with made-up dates that fit the kind. Used only for the test copy. */
function sampleDays(kind: AccountEmailKind, today: string) {
  switch (kind) {
    case 'trial_14':
      return { trialEndsOn: addDays(today, 14), overdueSince: null };
    case 'trial_7':
      return { trialEndsOn: addDays(today, 7), overdueSince: null };
    case 'overdue':
      return { trialEndsOn: null, overdueSince: today };
    case 'overdue_week':
      return { trialEndsOn: null, overdueSince: addDays(today, -7) };
    case 'paused':
      return { trialEndsOn: null, overdueSince: null };
  }
}

/**
 * WagonWise staff send an account email by hand. `company`: the real one, to the company's billing people, only while the company is in
 * the state the email is about, and logged like an automatic one. `me`: a test copy of the wording, with a sample company's dates, to
 * the signed-in staff member's own address; nothing is logged and nobody else is written to.
 */
export async function sendAccountEmailByHand(
  deps: AccountEmailDeps,
  actor: Actor,
  companyId: CompanyId,
  kind: AccountEmailKind,
  to: 'company' | 'me',
): Promise<
  Result<AccountEmailOutcome, Forbidden | CompanyNotFound | WrongState | NoRecipients | EmailFailed>
> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  if (to === 'company') return deliverAccountEmail(deps, companyId, kind);

  const [company, me, settings] = await Promise.all([
    deps.companies.findById(companyId),
    deps.accounts.findById(actor.staffId),
    deps.states.getSettings(),
  ]);
  if (company === null) return err({ tag: 'CompanyNotFound' });
  if (me === null) return err({ tag: 'Forbidden' });
  const today = ukDay(deps.clock.now());
  const email = buildAccountEmail({
    kind,
    recipientName: me.name,
    companyName: company.name,
    today,
    ...sampleDays(kind, today),
    graceDays: settings.graceDays,
    hold: false,
    dashboardUrl: deps.dashboardUrl,
  });
  try {
    await deps.mailer.send(me.email, `[Test] ${email.subject}`, email.text);
  } catch {
    return err({ tag: 'EmailFailed' });
  }
  return ok({ sent: 1, alreadySent: false });
}
