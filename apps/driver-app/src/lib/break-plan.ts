import { RULES, type HoursStatus, type RuleSet } from './driver-hours';
import { routeProgress, type RoutePoint } from './route-progress';

/** The most a stop may be off the route to be offered, in metres. */
export const MAX_OFF_ROUTE_M = 3000;

export interface BreakPlan {
  /**
   * `none`: the driver can reach the end within the time they have.
   * `break`: they can, with `breaks` break(s) on the way.
   * `limit`: they cannot reach the end within their driving limit (today's, the week's or the fortnight's), and a rest is needed first.
   */
  readonly kind: 'none' | 'break' | 'limit';
  readonly breaks: number;
  /** Driving time until the first stop is needed; `null` when none is. */
  readonly firstStopInMs: number | null;
  /** Arrival, with the breaks on the way, in ms since the epoch; `null` when the end cannot be reached today. */
  readonly arrivalMs: number | null;
  /** How far along what is left of the route the first stop falls (0 to 1); `null` when none is needed. */
  readonly firstStopFraction: number | null;
}

/**
 * Works out whether the driver will need a break (or run out of driving time) before the end of the route, and so the
 * arrival time with the break(s) in it. `remainingMin` is the driving time left on the route. Only the break rule is
 * modelled: a stop of the rule set's break length each time the allowed stretch of driving is used.
 */
export function planBreak(
  status: HoursStatus,
  rules: RuleSet,
  remainingMin: number,
  now: number,
): BreakPlan {
  const remainingMs = Math.max(0, remainingMin) * 60_000;
  if (remainingMs <= status.drivingLeftMs) {
    return {
      kind: 'none',
      breaks: 0,
      firstStopInMs: null,
      arrivalMs: now + remainingMs,
      firstStopFraction: null,
    };
  }
  const fraction = Math.min(1, status.drivingLeftMs / remainingMs);
  if (remainingMs > status.untilLimitMs) {
    return {
      kind: 'limit',
      breaks: 0,
      firstStopInMs: status.drivingLeftMs,
      arrivalMs: null,
      firstStopFraction: fraction,
    };
  }
  const rule = RULES[rules];
  const stretch = rule.drivingBeforeBreakMs;
  let breaks = 1;
  if (stretch !== null) {
    let left = remainingMs - status.drivingLeftMs;
    while (left > stretch) {
      breaks += 1;
      left -= stretch;
    }
  }
  return {
    kind: 'break',
    breaks,
    firstStopInMs: status.drivingLeftMs,
    arrivalMs: now + remainingMs + breaks * rule.breakMs,
    firstStopFraction: fraction,
  };
}

export interface ParkingCandidate {
  readonly id: string;
  readonly location: RoutePoint;
}

export interface ParkingOnTheWay<T extends ParkingCandidate> {
  readonly spot: T;
  /** Driving time from here to the spot, in minutes. */
  readonly minutes: number;
}

/**
 * The parking spots beside the route that come before the first stop is needed, nearest the limit first (so the driver
 * uses as much of their time as they can). A spot behind the driver, off the route, or past the limit is left out.
 */
export function parkingBeforeStop<T extends ParkingCandidate>(
  spots: readonly T[],
  routeLine: readonly (readonly [number, number])[],
  position: RoutePoint,
  plan: BreakPlan,
  remainingMin: number,
  limit = 3,
): ParkingOnTheWay<T>[] {
  if (plan.firstStopFraction === null || routeLine.length < 2) return [];
  const here = routeProgress(routeLine, position).remainingFraction;
  if (here <= 0) return [];
  const stopAt = here * (1 - plan.firstStopFraction);
  return spots
    .map((spot) => ({ spot, progress: routeProgress(routeLine, spot.location) }))
    .filter(
      ({ progress }) =>
        progress.offRouteMetres <= MAX_OFF_ROUTE_M &&
        progress.remainingFraction < here - 0.002 &&
        progress.remainingFraction >= stopAt,
    )
    .sort((a, b) => a.progress.remainingFraction - b.progress.remainingFraction)
    .slice(0, limit)
    .map(({ spot, progress }) => ({
      spot,
      minutes: Math.round(((here - progress.remainingFraction) / here) * remainingMin),
    }));
}
