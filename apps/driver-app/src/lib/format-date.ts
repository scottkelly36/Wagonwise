// UK English throughout (AGENTS.md) — 'en-GB' gives day/month/year and 24-hour time, matching
// UK driver habit rather than the US default `Date.prototype.toLocaleString` would otherwise use.
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Clock time only (24-hour, 'en-GB') — for an ETA shown alongside "today", where the date
 *  itself adds nothing a driver needs. */
export function formatTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
