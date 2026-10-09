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

/** "9 Oct" for a `YYYY-MM-DD` day. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
