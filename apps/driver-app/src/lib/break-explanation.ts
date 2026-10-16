import type { BreakPlan } from './break-plan';
import { RULES, type RuleSet } from './driver-hours';
import { formatDuration } from './format-duration';

/**
 * Why the arrival time is later than the drive: on a long route the driver's hours need breaks, and the arrival time includes
 * them. Says how long the driving is, what the breaks add, and the total, so "ETA in 13 hours" is not a surprise on a drive that
 * is ten. `undefined` when the arrival has no breaks in it.
 */
export function breakExplanation(
  plan: BreakPlan,
  rules: RuleSet,
  drivingMin: number,
): string | undefined {
  if (plan.kind !== 'break' || plan.breaks < 1) return undefined;
  const breakMin = RULES[rules].breakMs / 60_000;
  if (breakMin <= 0) return undefined;
  const restMin = plan.breaks * breakMin;
  const breaks = plan.breaks === 1 ? 'a break' : `${plan.breaks} breaks`;
  return (
    `Driving takes ${formatDuration(drivingMin)}. Your driving hours need ${breaks} of ` +
    `${formatDuration(breakMin)}${plan.breaks === 1 ? '' : ` (${formatDuration(restMin)} of rest)`}, ` +
    `so the journey is about ${formatDuration(drivingMin + restMin)} in all.`
  );
}
