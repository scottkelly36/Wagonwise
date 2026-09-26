import { routeProgress, type RoutePoint } from './route-progress';

export interface HazardAheadInput {
  readonly id: string;
  readonly location: RoutePoint;
}

/**
 * Which of `hazards` sit ahead of `position` along `routeLine`, within `thresholdMetres` — a
 * route-relative distance (via `routeProgress`'s own nearest-point-on-line snap for both the
 * driver and each hazard), not a straight line. A hazard just passed is behind by this measure
 * even when it's still the closest point as the crow flies, so it never re-triggers once the
 * driver's gone past it.
 */
export function hazardsAheadWithinRange(
  routeLine: readonly (readonly [number, number])[],
  position: RoutePoint,
  hazards: readonly HazardAheadInput[],
  thresholdMetres: number,
): string[] {
  const driverTraveledMetres = routeProgress(routeLine, position).traveledMetres;
  return hazards
    .filter((hazard) => {
      const aheadMetres =
        routeProgress(routeLine, hazard.location).traveledMetres - driverTraveledMetres;
      return aheadMetres >= 0 && aheadMetres <= thresholdMetres;
    })
    .map((hazard) => hazard.id);
}
