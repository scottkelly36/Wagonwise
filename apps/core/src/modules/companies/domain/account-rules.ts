import type { AccountEmailKind } from './account-emails.js';
import { daysBetween, ukDay, type AccountSettings, type AccountState } from './account-state.js';

/** How many days into being overdue the reminder goes. */
export const OVERDUE_REMINDER_DAY = 7;
/** The two trial emails: when the free period has this many days or fewer left (the later one wins, each once). */
export const TRIAL_FIRST_NOTICE_DAYS = 14;
export const TRIAL_SECOND_NOTICE_DAYS = 7;
/** Nothing is done before this hour UK time, so an email never goes in the night. */
export const FIRST_RULE_HOUR = 7;

export type RuleAction =
  | { readonly type: 'move'; readonly to: 'overdue' | 'paused'; readonly note: string }
  | { readonly type: 'email'; readonly kind: AccountEmailKind };

/**
 * What the automatic rules do next for one company on a UK day (docs/company-account-states-scope.md): a pure function of its state, the
 * settings and the day, so it is tested with plain dates. At most one thing at a time; the runner asks again after a move.
 *
 * - A company with the owner's hold, or with the rules off, is left alone. A company that is active or paused is left alone: a pause is
 *   only ever undone by a person (until the payment provider can do it).
 * - Trial: an email once 14 days or fewer are left, another at 7 or fewer; the day after the last free day it becomes overdue. There is
 *   no payment provider yet, so no company ever has payment details on file at that point.
 * - Overdue: the overdue email, then a reminder a week in; once the grace period has passed it is paused, if the rules are on in full.
 */
export function nextAction(
  state: AccountState,
  settings: AccountSettings,
  today: string,
): RuleAction | null {
  if (settings.automation === 'off' || state.hold) return null;

  if (state.status === 'trial' && state.trialEndsOn !== null) {
    const left = daysBetween(today, state.trialEndsOn);
    if (left < 0) {
      return {
        type: 'move',
        to: 'overdue',
        note: `Automatic: the free period ended on ${state.trialEndsOn} and no payment details are on file`,
      };
    }
    if (left <= TRIAL_SECOND_NOTICE_DAYS) return { type: 'email', kind: 'trial_7' };
    if (left <= TRIAL_FIRST_NOTICE_DAYS) return { type: 'email', kind: 'trial_14' };
    return null;
  }

  if (state.status === 'overdue') {
    const since = state.overdueSince === null ? today : ukDay(state.overdueSince);
    const days = daysBetween(since, today);
    if (settings.automation === 'full' && days >= settings.graceDays) {
      return {
        type: 'move',
        to: 'paused',
        note: `Automatic: overdue since ${since}, and the grace period of ${settings.graceDays} days has passed`,
      };
    }
    return { type: 'email', kind: days >= OVERDUE_REMINDER_DAY ? 'overdue_week' : 'overdue' };
  }

  return null;
}
