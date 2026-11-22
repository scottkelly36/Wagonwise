import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  MAX_GRACE_DAYS,
  MAX_NOTE_LENGTH,
  MAX_TRIAL_DAYS,
  trialEndsOn,
  ukDay,
  type AccountSettings,
  type AccountState,
  type AccountStatus,
} from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';

export type CompanyNotFound = TaggedError<'CompanyNotFound'>;
export type InvalidSetting = TaggedError<'InvalidSetting'>;

export interface AccountStateDeps {
  readonly states: AccountStateRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** The state a company starts in when WagonWise makes it: a free trial of the length in the settings, from today. */
export async function newCompanyState(
  deps: { readonly states: Pick<AccountStateRepository, 'getSettings'>; readonly clock: Clock },
  companyId: CompanyId,
): Promise<AccountState> {
  const settings = await deps.states.getSettings();
  return {
    companyId,
    status: 'trial',
    trialEndsOn: trialEndsOn(ukDay(deps.clock.now()), settings.defaultTrialDays),
    overdueSince: null,
    pausedAt: null,
    note: '',
    hold: false,
  };
}

/** WagonWise staff see any company's state, with the owner's note and hold. A company's own staff use `getOwnAccountState`. */
export async function getAccountState(
  deps: Pick<AccountStateDeps, 'states'>,
  actor: Actor,
  companyId: CompanyId,
): Promise<Result<AccountState, Forbidden | CompanyNotFound>> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  const state = await deps.states.get(companyId);
  return state === null ? err({ tag: 'CompanyNotFound' }) : ok(state);
}

/** What a company's own staff see of its state, for the banner. WagonWise staff have no company of their own. */
export async function getOwnAccountState(
  deps: Pick<AccountStateDeps, 'states'>,
  actor: Actor,
): Promise<Result<AccountState, Forbidden | CompanyNotFound>> {
  if (actor.kind !== 'fleet') return err({ tag: 'Forbidden' });
  const state = await deps.states.get(actor.companyId);
  return state === null ? err({ tag: 'CompanyNotFound' }) : ok(state);
}

export interface SetAccountStateInput {
  readonly status: AccountStatus;
  /** The end day of a trial. Left out on a trial: the default length from today. Ignored for any other state. */
  readonly trialEndsOn?: string | null | undefined;
  /** "Never pause this company". Left as it is when not sent. */
  readonly hold?: boolean | undefined;
  readonly note: string;
}

/**
 * WagonWise staff move a company to a state, by hand: the owner's buttons. A trial can be extended by setting `trial` with a later
 * day. The move is kept in the log with who made it. Setting the state a company is already in changes the day, note or hold
 * without adding a log line.
 */
export async function setAccountState(
  deps: AccountStateDeps,
  actor: Actor,
  companyId: CompanyId,
  input: SetAccountStateInput,
): Promise<Result<AccountState, Forbidden | CompanyNotFound | InvalidSetting>> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  if (input.note.length > MAX_NOTE_LENGTH) return err({ tag: 'InvalidSetting' });
  const current = await deps.states.get(companyId);
  if (current === null) return err({ tag: 'CompanyNotFound' });

  const now = deps.clock.now();
  const today = ukDay(now);
  let endsOn: string | null = null;
  if (input.status === 'trial') {
    if (input.trialEndsOn === undefined || input.trialEndsOn === null) {
      endsOn = trialEndsOn(today, (await deps.states.getSettings()).defaultTrialDays);
    } else if (input.trialEndsOn < today) {
      return err({ tag: 'InvalidSetting' });
    } else {
      endsOn = input.trialEndsOn;
    }
  }

  const next: AccountState = {
    companyId,
    status: input.status,
    trialEndsOn: endsOn,
    overdueSince: input.status === 'overdue' ? (current.overdueSince ?? now) : null,
    pausedAt: input.status === 'paused' ? (current.pausedAt ?? now) : null,
    note: input.note,
    hold: input.hold ?? current.hold,
  };
  await deps.states.save(next);
  if (current.status !== input.status) {
    await deps.states.appendMove({
      id: deps.ids.newId(),
      companyId,
      from: current.status,
      to: input.status,
      byStaffId: actor.staffId,
      note: input.note,
      at: now,
    });
  }
  return ok(next);
}

export async function getAccountSettings(
  deps: Pick<AccountStateDeps, 'states'>,
  actor: Actor,
): Promise<Result<AccountSettings, Forbidden>> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.states.getSettings());
}

/** The free period for companies made from now on, and how long a company is overdue before it is paused. A company already on a
 *  trial keeps the day it was given. */
export async function setAccountSettings(
  deps: AccountStateDeps,
  actor: Actor,
  settings: AccountSettings,
): Promise<Result<AccountSettings, Forbidden | InvalidSetting>> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  const trialOk =
    Number.isInteger(settings.defaultTrialDays) &&
    settings.defaultTrialDays >= 1 &&
    settings.defaultTrialDays <= MAX_TRIAL_DAYS;
  const graceOk =
    Number.isInteger(settings.graceDays) &&
    settings.graceDays >= 0 &&
    settings.graceDays <= MAX_GRACE_DAYS;
  if (!trialOk || !graceOk) return err({ tag: 'InvalidSetting' });
  await deps.states.saveSettings(settings, actor.staffId, deps.clock.now());
  return ok(settings);
}
