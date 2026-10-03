import type { Result } from '../../../shared/result.js';
import type { GeoPoint } from '../domain/geo.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type { NoRouteFound, RouteResult, RoutingEngine } from './ports/routing-engine.js';

export interface EstimateRouteDeps {
  readonly routingEngine: RoutingEngine;
}

export interface EstimateRouteInput {
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
  readonly dimensions: Dimensions;
}

/**
 * How far and how long between two points for a vehicle of these dimensions, and the route's line
 * (P2-M6.4, for a company job's ETA and the dispatcher's map). Nobody's profile is involved: `jobs`
 * supplies the dimensions of the company vehicle the job is assigned to, read from `fleet` by
 * `composition/`, so routing stays unaware of both.
 *
 * Like `previewRouteOptions`, deliberately unpersisted and hazard-agnostic (`avoid: []`): this is
 * an estimate of travel time, not a plan a driver follows, so it neither stores a `RoutePlan` nor
 * does `planRoute`'s second, hazard-avoiding pass. It can therefore be a little optimistic when a
 * community hazard would force a detour.
 */
export function estimateRoute(
  deps: EstimateRouteDeps,
  input: EstimateRouteInput,
): Promise<Result<RouteResult, NoRouteFound>> {
  return deps.routingEngine.route({
    origin: input.origin,
    destination: input.destination,
    dimensions: input.dimensions,
    avoid: [],
  });
}
