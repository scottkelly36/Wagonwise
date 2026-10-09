import type { Activity, ActivityKind } from './driver-hours';

/** How long a record is kept on the phone. Weekly limits will need a week and more; nothing is sent anywhere. */
export const KEEP_MS = 15 * 24 * 3_600_000;

/** The activity still going on, if any. */
export const currentActivity = (log: readonly Activity[]): Activity | undefined => {
  const last = log.at(-1);
  return last !== undefined && last.end === undefined ? last : undefined;
};

/**
 * Moves the driver on to `kind` at `now`: whatever was going on ends, and the new one starts. Choosing what is already
 * going on changes nothing. Old records are dropped. `finish` ends the current one and starts nothing.
 */
export function switchActivity(
  log: readonly Activity[],
  kind: ActivityKind | 'finish',
  now: number,
): Activity[] {
  const open = currentActivity(log);
  if (open !== undefined && open.kind === kind) return [...log];
  const closed = log
    .map((a) => (a.end === undefined ? { ...a, end: Math.max(now, a.start) } : a))
    .filter((a) => (a.end ?? now) > now - KEEP_MS);
  return kind === 'finish' ? closed : [...closed, { kind, start: now }];
}
