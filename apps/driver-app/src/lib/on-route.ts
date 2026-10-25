import { routeProgress, type RoutePoint } from './route-progress';

/** How far from the route's line something may be and still count as on it: the width of the road, with a little to spare for GPS and
 *  for where it was mapped. Wider than that and, in a town, it is on the next street over. */
export const ON_ROUTE_M = 30;

/** A stretch of the route that runs over a bridge, as the points where it starts and ends. */
export interface BridgeOnRoute {
  readonly from: RoutePoint;
  readonly to: RoutePoint;
}

/** What is known about the roads of the route, from the map data (the route's speed-limits answer carries it). Both parts are optional:
 *  when they could not be read nothing is ruled out. */
export interface RouteRoads {
  /** Where the route runs over a bridge. */
  readonly bridges?: readonly BridgeOnRoute[] | undefined;
  /** The OpenStreetMap ways the route runs along. */
  readonly wayIds?: readonly number[] | undefined;
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
 * on the road or spoken about as ahead.
 *
 * Closeness is not enough where roads cross, so when the map data says which road a hazard is on (`osmWayId`) and which roads the
 * route runs along (`roads.wayIds`), a hazard on any other road is dropped: a low bridge over the route, or a weight limit on a side
 * road at a junction, is not the driver's however close it is. Without that, a low bridge on a stretch where the route is itself up
 * on a bridge is dropped. When neither is known, nothing is dropped for this.
 *
 * Worked out once per route and set of items, not on every position update: it snaps each one onto the route's line, which is slow
 * for a long route.
 */
export function placeOnRoute<
  T extends {
    readonly location: RoutePoint;
    readonly type?: string;
    readonly osmWayId?: number | undefined;
  },
>(
  routeLine: readonly (readonly [number, number])[],
  items: readonly T[],
  roads: RouteRoads | undefined = undefined,
): Placed<T>[] {
  const wayIds =
    roads?.wayIds !== undefined && roads.wayIds.length > 0 ? new Set(roads.wayIds) : undefined;
  const overBridge = (roads?.bridges ?? []).map((b) => {
    const a = routeProgress(routeLine, b.from).traveledMetres;
    const z = routeProgress(routeLine, b.to).traveledMetres;
    return { from: Math.min(a, z) - BRIDGE_ENDS_M, to: Math.max(a, z) + BRIDGE_ENDS_M };
  });
  const placed: Placed<T>[] = [];
  for (const item of items) {
    const at = routeProgress(routeLine, item.location);
    if (at.offRouteMetres > ON_ROUTE_M) continue;
    if (item.osmWayId !== undefined && wayIds !== undefined) {
      // The road it is mapped on is not one the route uses: it crosses or joins the route.
      if (!wayIds.has(item.osmWayId)) continue;
    } else if (
      // A low bridge is a limit on the road underneath: on a stretch where the route is up on a bridge, the driver is going over it.
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
