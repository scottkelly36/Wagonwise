import type { Result, TaggedError } from '../../../../shared/result.js';
import type { GeoLine, GeoPoint, GeoPolygon } from '../../domain/geo.js';
import type { Dimensions } from '../../domain/vehicle-profile.js';

export interface RouteRequest {
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
  readonly dimensions: Dimensions;
  /** Areas the vehicle must not be routed through — how community hazards feed into routing
   *  (design doc §4/§5). Empty when nothing nearby applies to this vehicle. */
  readonly avoid: readonly GeoPolygon[];
}

export interface RouteResult {
  readonly geometry: GeoLine;
  readonly distanceKm: number;
  readonly durationMin: number;
}

/** The vehicle genuinely cannot get there — every path is blocked by its own dimensions, the
 *  avoid areas, or both. An expected outcome (a real driver's van might not fit down a lane), not
 *  an infrastructure fault, so it's a Result error, not a throw. */
export type NoRouteFound = TaggedError<'NoRouteFound'>;

/**
 * Truck-aware routing, behind a port (design doc §4) so Valhalla can be swapped for GraphHopper
 * later without touching anything that calls this.
 */
export interface RoutingEngine {
  route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>>;
}
