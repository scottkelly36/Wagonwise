import type { ManeuverDto } from '@wagonwise/contracts/routing';

import {
  routeProgress,
  routeVertexOffsets,
  type ProgressWindow,
  type RoutePoint,
} from './route-progress';
import { spokenDistance } from './uk-distance';

/**
 * Turn-by-turn guidance (P2-M10): from a route, its turn list and where the driver is, which turn
 * is next, how far away it is, whether the driver has left the route, and what (if anything) to say
 * right now. Pure functions: the speaking and the screen are in the hook and component around it.
 */

/** Steps that are never announced: setting off (the driver is already there), going straight on, and
 *  leaving a roundabout (the entry already said which exit to take). */
const SILENT_KINDS: ReadonlySet<ManeuverDto['kind']> = new Set([
  'depart',
  'straight',
  'roundabout_exit',
]);

/** How far ahead of a turn it is announced, longest first: a mile on a long fast stretch, half a mile,
 *  300 yards, then at the turn itself. A tier is only used when the previous turn left room for it
 *  (see `TIER_FITS_IN`), so close-together turns are not announced on top of each other. */
const ANNOUNCE_TIERS_M = [1609, 805, 275, 60] as const;
const NOW_M = 60;
/** Arriving is announced once, close in. */
const ARRIVE_M = 80;

/** A tier is only used if it is no more than this fraction of the distance since the previous turn. */
const TIER_FITS_IN = 0.8;

/** A turn this far behind the driver is done. */
const PASSED_BY_M = 25;

/** Further than this from the route line is "off route" (ordinary GPS noise is a few metres to a few
 *  tens of metres). The caller waits for several fixes in a row before believing it. */
export const OFF_ROUTE_M = 60;

/** Where on the route to look for the driver, around where they last were. Wide enough to cover a
 *  gap in GPS fixes at motorway speed. */
const SEARCH_BEHIND_M = 300;
const SEARCH_AHEAD_M = 2500;
/** If the windowed search finds the driver this far from the route, look at the whole route instead:
 *  they may have been out of signal, or reappeared elsewhere. */
const WIDEN_SEARCH_AT_M = 150;

export interface UpcomingTurn {
  readonly index: number;
  readonly maneuver: ManeuverDto;
  readonly distanceM: number;
}

export interface Utterance {
  /** Identifies what was said, so it is said once. */
  readonly key: string;
  readonly text: string;
  /** Said even if something else is speaking (the turn itself is about to happen). */
  readonly urgent: boolean;
}

export interface Guidance {
  /** The next turn worth showing, or undefined once past the last one. */
  readonly next: UpcomingTurn | undefined;
  readonly traveledMetres: number;
  readonly offRouteMetres: number;
  /** What to say now, if anything. Not yet marked as said: the caller does that once it speaks it. */
  readonly utterance: Utterance | undefined;
}

export interface GuidanceInput {
  readonly routeLine: readonly (readonly [number, number])[];
  readonly maneuvers: readonly ManeuverDto[];
  /** Metres along the route at the start of each turn: `turnOffsets(routeLine, maneuvers)`. */
  readonly offsets: readonly number[];
  readonly position: RoutePoint;
  /** How far along the route the driver was last time, to search around. */
  readonly lastTraveledMetres: number | undefined;
  readonly announced: ReadonlySet<string>;
}

/** Where each turn begins along the route, from the geometry. Compute once per route. */
export function turnOffsets(
  routeLine: readonly (readonly [number, number])[],
  maneuvers: readonly ManeuverDto[],
): number[] {
  const vertices = routeVertexOffsets(routeLine);
  const end = vertices[vertices.length - 1] ?? 0;
  return maneuvers.map((m) => vertices[m.beginShapeIndex] ?? end);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function windowAround(traveled: number): ProgressWindow {
  return { aroundMetres: traveled, behindMetres: SEARCH_BEHIND_M, aheadMetres: SEARCH_AHEAD_M };
}

/** The tiers usable for a turn that comes `availableM` after the previous one. The final "at the turn"
 *  tier is always usable. */
function usableTiers(kind: ManeuverDto['kind'], availableM: number): number[] {
  if (kind === 'arrive') return [ARRIVE_M];
  return ANNOUNCE_TIERS_M.filter((tier) => tier === NOW_M || tier <= availableM * TIER_FITS_IN);
}

export function evaluateGuidance(input: GuidanceInput): Guidance {
  const { routeLine, maneuvers, offsets, position, lastTraveledMetres, announced } = input;

  let progress =
    lastTraveledMetres === undefined
      ? routeProgress(routeLine, position)
      : routeProgress(routeLine, position, windowAround(lastTraveledMetres));
  if (lastTraveledMetres !== undefined && progress.offRouteMetres > WIDEN_SEARCH_AT_M) {
    progress = routeProgress(routeLine, position);
  }
  const traveled = progress.traveledMetres;

  const index = maneuvers.findIndex(
    (m, i) => !SILENT_KINDS.has(m.kind) && (offsets[i] ?? 0) - traveled > -PASSED_BY_M,
  );
  const base = { traveledMetres: traveled, offRouteMetres: progress.offRouteMetres };
  if (index === -1) return { ...base, next: undefined, utterance: undefined };

  const maneuver = maneuvers[index];
  const distance = Math.max(0, (offsets[index] ?? 0) - traveled);
  const next: UpcomingTurn = { index, maneuver, distanceM: distance };

  // Nothing is said once the driver is off the route: the turns no longer apply to where they are.
  const available = (offsets[index] ?? 0) - (index > 0 ? (offsets[index - 1] ?? 0) : 0);
  const due = usableTiers(maneuver.kind, available)
    .filter((tier) => tier >= distance)
    .sort((a, b) => a - b)[0];
  if (due === undefined) return { ...base, next, utterance: undefined };

  const key = `${index}:${due}`;
  if (announced.has(key)) return { ...base, next, utterance: undefined };

  const nowTier = due <= ARRIVE_M;
  const text = nowTier
    ? maneuver.speech
    : `In ${spokenDistance(distance)}, ${lowerFirst(maneuver.speech)}`;
  return { ...base, next, utterance: { key, text, urgent: nowTier } };
}
