import type { Result, TaggedError } from '../../../../shared/result.js';
import type { GeoLine, GeoPoint, GeoPolygon } from '../../domain/geo.js';
import type { Maneuver } from '../../domain/maneuver.js';
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
  /** Turn-by-turn steps along `geometry` (P2-M10). Empty if the engine gave none. */
  readonly maneuvers: readonly Maneuver[];
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
  /** The primary route plus whatever alternates the engine can find for the same request (M9,
   *  docs/progress.md) — always at least one result on success. Kept as its own method rather than
   *  an `alternates` flag on `route()`'s single-`RouteResult` return: every existing caller of
   *  `route()` wants exactly one result and shouldn't have to narrow an array, and `planRoute`'s
   *  hazard-avoidance re-plan pass (which always wants exactly one, already-avoiding result) keeps
   *  using `route()` unchanged. */
  routeAlternatives(req: RouteRequest): Promise<Result<readonly RouteResult[], NoRouteFound>>;
}
