const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 hours ago", "3 days ago"; "Never" when there is nothing. */
export function ago(iso: string | null, now: Date): string {
  if (iso === null) return 'Never';
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 2 * MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} minutes ago`;
  if (diff < 2 * HOUR) return '1 hour ago';
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hours ago`;
  if (diff < 2 * DAY) return '1 day ago';
  return `${Math.floor(diff / DAY)} days ago`;
}

/** Bar heights as whole percentages of the tallest; an all-zero series stays flat. */
export function barHeights(counts: readonly number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (max === 0 ? 0 : Math.round((c / max) * 100)));
}

/** "92%" of the whole, rounded; "0%" when there is no whole. */
export function percentOf(part: number, whole: number): string {
  return whole <= 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}

/** The days from the first one with a new driver onwards: the empty days before anyone joined say nothing. Oldest first in and out. */
export function fromFirstJoin<T extends { readonly joined: number }>(days: readonly T[]): T[] {
  const first = days.findIndex((d) => d.joined > 0);
  return first < 0 ? [] : days.slice(first);
}

/** A cohort's share at a stage: "61%", or a dash when nobody joined that day (nothing to take a share of). */
export function cohortShare(part: number, joined: number): string {
  return joined <= 0 ? '–' : percentOf(part, joined);
}

/** "110 (92%)": a count with its share of the accounts, for the funnel. */
export function withShare(part: number, whole: number): string {
  return `${part} (${percentOf(part, whole)})`;
}

/** "9 Oct" for a `YYYY-MM-DD` day. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** How many weeks after joining the "do they come back" table shows: week 1 (the week they joined) to week 8. */
export const RETENTION_WEEKS = 8;

/**
 * One row of the "do they come back" table: for the week they joined and each week after it, the share of that week's new drivers
 * who started a trip in it. A week that has not come yet is blank. The last filled cell is this week, which is not over.
 */
export function retentionCells(
  week: { readonly joined: number; readonly startedTripInWeek: readonly number[] },
  columns = RETENTION_WEEKS,
): string[] {
  return Array.from({ length: columns }, (_, k) => {
    const n = week.startedTripInWeek[k];
    return n === undefined ? '' : cohortShare(n, week.joined);
  });
}
