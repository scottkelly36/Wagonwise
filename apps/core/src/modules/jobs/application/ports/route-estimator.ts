import type { Result, TaggedError } from '../../../../shared/result.js';
import type { GeoPoint, VehicleId } from '../../domain/job.js';

/** How far, how long, and along which line (an encoded polyline6 string) a vehicle gets from one
 *  point to another. */
export interface RouteEstimate {
  readonly distanceKm: number;
  readonly durationMin: number;
  readonly geometry: string;
}

/** No estimate could be had: no route exists for that vehicle, or the vehicle is not known. An
 *  expected outcome the caller simply leaves out, not a fault. */
export type RouteUnavailable = TaggedError<'RouteUnavailable'>;

/**
 * Travel estimates for a company vehicle (P2-M6.4), in jobs' own terms (AGENTS.md rule 7). The
 * adapter lives in `composition/`: it reads the vehicle's dimensions from `fleet` and asks `routing`
 * for the route, so `jobs` knows about neither.
 */
export interface JobRouteEstimator {
  estimate(input: {
    readonly vehicleId: VehicleId;
    readonly from: GeoPoint;
    readonly to: GeoPoint;
  }): Promise<Result<RouteEstimate, RouteUnavailable>>;
}
