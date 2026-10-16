import type { BreakPlan } from './break-plan';

/** A break closer than this opens the notice again, even if it was dismissed when the break was further off. */
export const BREAK_SOON_MS = 15 * 60_000;

/**
 * What identifies the break notice: its kind, and whether the first stop is near. A dismissed notice stays gone until this changes,
 * so it comes back when a break is under 15 minutes away, or when the plan turns into a rest that is needed.
 */
export function breakNoticeKey(plan: BreakPlan): string | undefined {
  if (plan.kind === 'none' || plan.firstStopInMs === null) return undefined;
  return `${plan.kind}:${plan.firstStopInMs <= BREAK_SOON_MS ? 'soon' : 'later'}`;
}

/** A time as it is said aloud: "12 minutes", "1 hour 5 minutes". */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const h = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const m = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (hours === 0) return m;
  return minutes === 0 ? h : `${h} ${m}`;
}

/** The short line spoken when the break notice appears. */
export function breakNoticeSpeech(plan: BreakPlan): string {
  if (plan.kind === 'limit') return 'Rest needed before you arrive.';
  if (plan.firstStopInMs === null) return '';
  return `Break needed in ${spokenDuration(plan.firstStopInMs)}.`;
}
