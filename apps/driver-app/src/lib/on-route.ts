import { routeProgress, type RoutePoint } from './route-progress';

/** How far from the route's line something may be and still count as on it: the width of the road, with a little to spare for GPS and
 *  for where it was mapped. Wider than that and, in a town, it is on the next street over. */
export const ON_ROUTE_M = 30;

/** A stretch of the route that runs over a bridge, as the points where it starts and ends. */
export interface BridgeOnRoute {
  readonly from: RoutePoint;
  readonly to: RoutePoint;
}

/** How far a low-bridge hazard may sit outside the bridge's ends and still be that bridge: where it was mapped, and where the router
 *  puts the ends of the bridge. */
const BRIDGE_ENDS_M = 15;

/** Something on the route, and how far along the route it is. */
export interface Placed<T> {
  readonly item: T;
  readonly offsetM: number;
}

/**
 * Those of `items` that are on the route itself, each with its distance along it. The query for hazards near the route reaches
 * 750 m either side, which in a town includes the next street over: a hazard there is not the driver's, and must not be drawn
 * on the road or spoken about as ahead. A low bridge on a stretch where the route is itself on a bridge is dropped too. Worked out once per route and set of items, not on every position update: it snaps each
 * one onto the route's line, which is slow for a long route.
 */
export function placeOnRoute<T extends { readonly location: RoutePoint; readonly type?: string }>(
  routeLine: readonly (readonly [number, number])[],
  items: readonly T[],
  bridges: readonly BridgeOnRoute[] = [],
): Placed<T>[] {
  const overBridge = bridges.map((b) => {
    const a = routeProgress(routeLine, b.from).traveledMetres;
    const z = routeProgress(routeLine, b.to).traveledMetres;
    return { from: Math.min(a, z) - BRIDGE_ENDS_M, to: Math.max(a, z) + BRIDGE_ENDS_M };
  });
  const placed: Placed<T>[] = [];
  for (const item of items) {
    const at = routeProgress(routeLine, item.location);
    if (at.offRouteMetres > ON_ROUTE_M) continue;
    // A low bridge is a limit on the road underneath: on a stretch where the route is up on a bridge, the driver is going over it.
    if (
      item.type === 'low_bridge' &&
      overBridge.some((b) => at.traveledMetres >= b.from && at.traveledMetres <= b.to)
    ) {
      continue;
    }
    placed.push({ item, offsetM: at.traveledMetres });
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
