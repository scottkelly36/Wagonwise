import type { ManeuverDto } from '@wagonwise/contracts/routing';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { RoutePoint } from '../lib/route-progress';
import {
  evaluateGuidance,
  OFF_ROUTE_M,
  turnOffsets,
  type UpcomingTurn,
  type Utterance,
} from '../lib/turn-guidance';

/** Fixes in a row beyond the route line before the driver is treated as off it: one noisy fix, or a
 *  moment cutting a corner, is not leaving the route. */
const OFF_ROUTE_FIXES = 3;

export interface TurnGuidanceState {
  readonly next: UpcomingTurn | undefined;
  readonly offRoute: boolean;
  /** The phrase to speak now; changes at most once per announcement. */
  readonly utterance: Utterance | undefined;
}

const NONE: TurnGuidanceState = { next: undefined, offRoute: false, utterance: undefined };

/**
 * Follows the driver along the route's turns (P2-M10): which turn is next, whether they have left
 * the route, and what to say. Routes planned before turn-by-turn existed have no turns and give
 * nothing. Starts afresh whenever the route (`routeLine`) changes, e.g. after a re-plan.
 *
 * The utterance is marked as said as soon as it is handed out, so a caller that decides not to speak
 * it (muted) does not get it again later, out of date.
 */
export function useTurnGuidance(
  routeLine: readonly (readonly [number, number])[] | undefined,
  maneuvers: readonly ManeuverDto[] | undefined,
  position: RoutePoint | undefined,
): TurnGuidanceState {
  const offsets = useMemo(
    () => (routeLine && maneuvers ? turnOffsets(routeLine, maneuvers) : undefined),
    [routeLine, maneuvers],
  );
  const announced = useRef<Set<string>>(new Set());
  const lastTraveled = useRef<number | undefined>(undefined);
  const offRouteFixes = useRef(0);
  const [state, setState] = useState<TurnGuidanceState>(NONE);

  const guidedLine = useRef(routeLine);

  useEffect(() => {
    if (!routeLine || !maneuvers || !offsets || maneuvers.length === 0 || !position) return;
    // A different route (after a re-plan): nothing said or learned about the old one applies.
    if (guidedLine.current !== routeLine) {
      guidedLine.current = routeLine;
      announced.current = new Set();
      lastTraveled.current = undefined;
      offRouteFixes.current = 0;
    }
    const g = evaluateGuidance({
      routeLine,
      maneuvers,
      offsets,
      position,
      lastTraveledMetres: lastTraveled.current,
      announced: announced.current,
    });
    lastTraveled.current = g.traveledMetres;
    offRouteFixes.current = g.offRouteMetres > OFF_ROUTE_M ? offRouteFixes.current + 1 : 0;
    const offRoute = offRouteFixes.current >= OFF_ROUTE_FIXES;

    // Turns do not apply to where an off-route driver is, so nothing is said.
    const utterance = offRoute ? undefined : g.utterance;
    if (utterance) announced.current.add(utterance.key);
    setState({ next: g.next, offRoute, utterance });
  }, [routeLine, maneuvers, offsets, position]);

  return state;
}
