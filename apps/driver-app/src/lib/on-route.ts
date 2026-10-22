import { routeProgress, type RoutePoint } from './route-progress';

/** How far from the route's line something may be and still count as on it: the width of the road, with a little to spare for GPS and
 *  for where it was mapped. Wider than that and, in a town, it is on the next street over. */
export const ON_ROUTE_M = 30;

/** Something on the route, and how far along the route it is. */
export interface Placed<T> {
  readonly item: T;
  readonly offsetM: number;
}

/**
 * Those of `items` that are on the route itself, each with its distance along it. The query for hazards near the route reaches
 * 750 m either side, which in a town includes the next street over: a hazard there is not the driver's, and must not be drawn
 * on the road or spoken about as ahead. Worked out once per route and set of items, not on every position update: it snaps each
 * one onto the route's line, which is slow for a long route.
 */
export function placeOnRoute<T extends { readonly location: RoutePoint }>(
  routeLine: readonly (readonly [number, number])[],
  items: readonly T[],
): Placed<T>[] {
  const placed: Placed<T>[] = [];
  for (const item of items) {
    const at = routeProgress(routeLine, item.location);
    if (at.offRouteMetres <= ON_ROUTE_M) placed.push({ item, offsetM: at.traveledMetres });
  }
  return placed;
}

/** Those still ahead of the driver (or only just passed), so a hazard behind them is neither drawn nor spoken about. */
export function stillAhead<T>(
  placed: readonly Placed<T>[],
  traveledMetres: number,
  behindM = ON_ROUTE_M,
): T[] {
  return placed.filter((p) => p.offsetM >= traveledMetres - behindM).map((p) => p.item);
}
