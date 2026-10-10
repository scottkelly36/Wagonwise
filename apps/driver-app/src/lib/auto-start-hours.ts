import type { ActivityKind } from './driver-hours';

/** What the driver chose for "when I start a route": be asked, start the clock, or leave it alone. */
export type StartPreference = 'ask' | 'always' | 'never';

export const START_PREFERENCES: readonly StartPreference[] = ['ask', 'always', 'never'];

/** Reads a saved choice; anything unrecognised means "ask", the cautious default. */
export function parseStartPreference(raw: unknown): StartPreference {
  return START_PREFERENCES.find((p) => p === raw) ?? 'ask';
}

export type AutoStartDecision = 'start' | 'ask' | 'nothing';

/**
 * What to do when a route starts. `open` is what the clock says the driver is doing now (undefined: no shift is on).
 *
 *   - Already driving: nothing to do.
 *   - "Start the clock": switch to Driving, whatever it said (no shift, other work, a break or a rest: setting off ends them).
 *     That is the safe way round: counting driving earlier only makes the advice more cautious.
 *   - "Ask me": ask, but only when no shift is on. A driver who has started the clock themselves has already decided.
 *   - "Don't": leave it to the buttons.
 */
export function decideAutoStart(
  preference: StartPreference,
  open: ActivityKind | undefined,
): AutoStartDecision {
  if (open === 'driving') return 'nothing';
  if (preference === 'always') return 'start';
  if (preference === 'ask' && open === undefined) return 'ask';
  return 'nothing';
}
