/**
 * When to remind a driver that a trip is still running. A driver who arrives and closes the app without tapping End trip leaves
 * it running; a quiet reminder brings them back to end it, before the server ends it itself a day after it started.
 */

/** How long after the planned arrival to wait: long enough that a driver held up in traffic or still unloading is not nagged. */
export const REMIND_AFTER_PLANNED_ARRIVAL_MS = 2 * 60 * 60 * 1000;

/** No reminder between 21:00 and 07:00 UK time: one that waits for the morning is better than one that wakes a driver. */
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 7;

/** The hour in UK time (0 to 23). */
export function ukHour(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false,
  }).format(at);
  return Number(hour) % 24;
}

/** Whether a running trip's reminder is due now: two hours past its planned arrival, and not in the quiet hours. */
export function reminderDue(startedAt: Date, plannedDurationMin: number, now: Date): boolean {
  const plannedArrival = startedAt.getTime() + Math.max(0, plannedDurationMin) * 60 * 1000;
  if (now.getTime() < plannedArrival + REMIND_AFTER_PLANNED_ARRIVAL_MS) return false;
  const hour = ukHour(now);
  return hour >= QUIET_UNTIL_HOUR && hour < QUIET_FROM_HOUR;
}
