import { routeProgress, type RoutePoint } from './route-progress';

/** How far past a hazard the driver must be before it is asked about, in metres. */
export const ASK_PAST_METRES = 150;
/** Further past than this, the moment has gone: a hazard first seen this far behind (a trip started beyond it) is never asked about. */
export const ASK_UNTIL_PAST_METRES = 800;
/** A hazard within this distance ahead counts as "seen coming", so it can be asked about once passed. */
export const SEEN_AHEAD_METRES = 1000;
/** The most questions asked on one trip. */
export const MAX_QUESTIONS_PER_TRIP = 3;

export interface PassingHazard {
  readonly id: string;
  readonly location: RoutePoint;
}

export interface PassingState {
  /** Hazards seen within range ahead on this trip. */
  readonly seen: ReadonlySet<string>;
  /** Hazards already asked about (or skipped), never asked again. */
  readonly asked: ReadonlySet<string>;
}

export const NOTHING_PASSED: PassingState = { seen: new Set(), asked: new Set() };

/** How far ahead of the driver each hazard is along the route: positive ahead, negative once passed. */
export function aheadMetres(
  routeLine: readonly (readonly [number, number])[],
  position: RoutePoint,
  hazards: readonly PassingHazard[],
): ReadonlyMap<string, number> {
  const driver = routeProgress(routeLine, position).traveledMetres;
  return new Map(
    hazards.map((hazard) => [
      hazard.id,
      routeProgress(routeLine, hazard.location).traveledMetres - driver,
    ]),
  );
}

/**
 * Given where every hazard is now, which ones have just been passed (and so are due a question), and the updated state. A hazard
 * is due only if it was seen ahead first, is now at least `ASK_PAST_METRES` behind but not more than `ASK_UNTIL_PAST_METRES`,
 * and has not been asked about. Nothing is asked after the trip's limit.
 */
export function passedHazards(
  state: PassingState,
  ahead: ReadonlyMap<string, number>,
  questionsAlreadyAsked: number,
): { readonly state: PassingState; readonly due: string[] } {
  const seen = new Set(state.seen);
  const due: string[] = [];
  for (const [id, metres] of ahead) {
    if (metres >= 0 && metres <= SEEN_AHEAD_METRES) seen.add(id);
    if (
      seen.has(id) &&
      !state.asked.has(id) &&
      metres <= -ASK_PAST_METRES &&
      metres >= -ASK_UNTIL_PAST_METRES
    ) {
      due.push(id);
    }
  }
  // Closest to the driver first, and no more than the trip has left.
  due.sort((a, b) => Math.abs(ahead.get(a) ?? 0) - Math.abs(ahead.get(b) ?? 0));
  return {
    state: { seen, asked: state.asked },
    due: due.slice(0, Math.max(0, MAX_QUESTIONS_PER_TRIP - questionsAlreadyAsked)),
  };
}

export function markAsked(state: PassingState, id: string): PassingState {
  return { seen: state.seen, asked: new Set([...state.asked, id]) };
}
