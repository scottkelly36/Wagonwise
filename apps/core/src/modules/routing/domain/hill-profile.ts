/** The height of the road at a distance along a route, as the engine's height service gives it (about every 100 m). */
export interface ElevationPoint {
  readonly distanceM: number;
  readonly heightM: number;
}

/** A climb or descent of at least {@link STEEP_GRADE_PCT} over {@link WINDOW_M}, with the metres along the route it covers. */
export interface SteepStretch {
  readonly fromM: number;
  readonly toM: number;
  /** The steepest grade in it, as a positive percentage whichever way the road goes. */
  readonly gradePct: number;
}

export interface HillStats {
  /** Metres climbed in all, measured over {@link CLIMB_STEP_M} steps so that the height data's small errors do not add up to hills. */
  readonly climbM: number;
  readonly highestPointM: number;
  /** The steepest grade over {@link WINDOW_M}, as a positive percentage, climbing or descending. */
  readonly steepestPct: number;
  readonly steepKm: number;
  readonly stretches: readonly SteepStretch[];
}

/**
 * A grade is judged over this far, not from one pair of points: heights come from 90 m cells with an error of several metres, so
 * over 100 m a 4 m error looks like a 4% hill. Over 500 m it is under 1%.
 */
export const WINDOW_M = 500;

/** Below this a grade is not read at all: a window shorter than this, at the end of a route, is mostly error. */
const MIN_WINDOW_M = 400;

/** A loaded lorry is slow up a sustained 6% and has to be careful coming down it. This is the first number to tune on real routes. */
export const STEEP_GRADE_PCT = 6;

const CLIMB_STEP_M = 300;

/** Where the first point at least `WINDOW_M` after `from` is, or the last point if that is at least `MIN_WINDOW_M` on. */
function windowEnd(
  points: readonly ElevationPoint[],
  from: number,
  start: number,
): number | undefined {
  for (let j = from + 1; j < points.length; j++) {
    if (points[j]!.distanceM - start >= WINDOW_M) return j;
  }
  const last = points.length - 1;
  return last > from && points[last]!.distanceM - start >= MIN_WINDOW_M ? last : undefined;
}

/**
 * How hilly a route is, from its heights. A stretch is steep when the grade over a 500 m window reaches `limitPct`, climbing or
 * descending; windows that overlap or touch are one stretch, and `steepKm` is the length of all the stretches.
 */
export function hillStats(
  points: readonly ElevationPoint[],
  limitPct: number = STEEP_GRADE_PCT,
): HillStats {
  if (points.length === 0) {
    return { climbM: 0, highestPointM: 0, steepestPct: 0, steepKm: 0, stretches: [] };
  }

  let highestPointM = -Infinity;
  for (const p of points) highestPointM = Math.max(highestPointM, p.heightM);

  let climbM = 0;
  let previous = points[0]!;
  for (const p of points) {
    if (p.distanceM - previous.distanceM < CLIMB_STEP_M) continue;
    climbM += Math.max(0, p.heightM - previous.heightM);
    previous = p;
  }

  let steepestPct = 0;
  const stretches: { fromM: number; toM: number; gradePct: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const j = windowEnd(points, i, start.distanceM);
    if (j === undefined) break;
    const end = points[j]!;
    const gradePct =
      (Math.abs(end.heightM - start.heightM) / (end.distanceM - start.distanceM)) * 100;
    steepestPct = Math.max(steepestPct, gradePct);
    if (gradePct < limitPct) continue;
    const open = stretches[stretches.length - 1];
    if (open !== undefined && start.distanceM <= open.toM) {
      open.toM = Math.max(open.toM, end.distanceM);
      open.gradePct = Math.max(open.gradePct, gradePct);
    } else {
      stretches.push({ fromM: start.distanceM, toM: end.distanceM, gradePct });
    }
  }

  const steepKm = stretches.reduce((sum, s) => sum + (s.toM - s.fromM), 0) / 1000;
  return { climbM, highestPointM, steepestPct, steepKm, stretches };
}
