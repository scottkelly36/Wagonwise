/**
 * When to show the phone's own "rate this app" prompt (Apple's and Google's in-app review): right after a driver ends a trip, once
 * they have finished trips on at least two different days (they have seen it work), and at most once in REVIEW_GAP_DAYS. Never while
 * driving, never during set-up. Apple and Google also limit how often their prompt really shows (Apple: three times a year), so this
 * is the most we ask, not how often it appears. No reward and no "do you like us?" question first: both stores forbid either.
 */
export const REVIEW_GAP_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewState {
  /** UK days (YYYY-MM-DD) on which the driver finished a trip; only the first two matter. */
  readonly tripDays: readonly string[];
  /** When the prompt was last asked for, ISO. */
  readonly lastAskedAt: string | null;
}

/** The day in the UK, so a trip ending just after midnight counts as the next day. */
export function ukDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);
}

/** The state after a trip ends: today added to the days, keeping at most two. */
export function afterTrip(state: ReviewState, now: Date): ReviewState {
  const today = ukDay(now);
  if (state.tripDays.includes(today) || state.tripDays.length >= 2) return state;
  return { ...state, tripDays: [...state.tripDays, today] };
}

export function shouldAskForReview(state: ReviewState, now: Date): boolean {
  if (state.tripDays.length < 2) return false;
  if (state.lastAskedAt === null) return true;
  const last = Date.parse(state.lastAskedAt);
  return !Number.isFinite(last) || now.getTime() - last >= REVIEW_GAP_DAYS * DAY_MS;
}
