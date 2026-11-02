import { avoidZonesFor } from '../domain/closure-avoid-zones.js';
import {
  closuresAtArrival,
  indexRoute,
  lookAheadHours,
  mustAvoid,
  placeClosuresOnRoute,
  type ClosureOnRoute,
} from '../domain/closure-on-route.js';
import { decodePolyline, type GeoLine, type GeoPolygon } from '../domain/geo.js';
import type { ClosureAvoidanceQuery } from './ports/closure-avoidance.js';

export interface ClosuresToAvoid {
  /** Every closure the route runs along that is shut when the driver gets there and that a route should go round. */
  readonly onRoute: readonly ClosureOnRoute[];
  /** Those of them not in `skip`, the ones to make a new route go round. */
  readonly fresh: readonly ClosureOnRoute[];
  /** The areas that keep a new route off `fresh`: thin, and on the carriageway the route uses. */
  readonly zones: readonly GeoPolygon[];
}

const NONE: ClosuresToAvoid = { onRoute: [], fresh: [], zones: [] };

/**
 * Which closures the route runs along and should go round, leaving at `departAt`, and the areas to keep a new route off them. Works
 * on the route as planned, so it asks again of a new route: going round one closure can lead through another.
 *
 * `skip` are closures that already have zones in the request; `maxZones` is how many more zones there is room for.
 */
export async function closuresToAvoidAlong(
  query: ClosureAvoidanceQuery,
  route: { readonly geometry: GeoLine; readonly durationMin: number },
  departAt: Date,
  options: { readonly skip: ReadonlySet<string>; readonly maxZones: number },
): Promise<ClosuresToAvoid> {
  const candidates = (await query.alongRoute(route.geometry, lookAheadHours(route.durationMin)))
    // A lane closure leaves the road open; only a shut road is gone round.
    .filter((c) => c.kind === 'full');
  if (candidates.length === 0) return NONE;

  const indexed = indexRoute(decodePolyline(route.geometry));
  const onRoute = closuresAtArrival(placeClosuresOnRoute(indexed, candidates), {
    departAt,
    durationMin: route.durationMin,
  }).filter(mustAvoid);
  const fresh = onRoute.filter((c) => !options.skip.has(c.closure.id));
  return { onRoute, fresh, zones: avoidZonesFor(indexed, fresh, options.maxZones) };
}
