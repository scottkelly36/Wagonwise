import { ok, type Result } from '../../../../shared/result.js';
import type {
  JobRouteEstimator,
  RouteEstimate,
  RouteUnavailable,
} from '../ports/route-estimator.js';
import type { GeoPoint, VehicleId } from '../../domain/job.js';

/** A configurable answer plus a log of what was asked, for use-case and route tests. */
export class FakeJobRouteEstimator implements JobRouteEstimator {
  result: Result<RouteEstimate, RouteUnavailable> = ok({
    distanceKm: 40,
    durationMin: 50,
    geometry: 'fake-line',
  });
  /** Set to make every call throw, like a routing engine that is down. */
  fault: Error | undefined;
  readonly requests: { vehicleId: VehicleId; from: GeoPoint; to: GeoPoint }[] = [];

  estimate(input: {
    vehicleId: VehicleId;
    from: GeoPoint;
    to: GeoPoint;
  }): Promise<Result<RouteEstimate, RouteUnavailable>> {
    this.requests.push(input);
    if (this.fault !== undefined) return Promise.reject(this.fault);
    return Promise.resolve(this.result);
  }
}
