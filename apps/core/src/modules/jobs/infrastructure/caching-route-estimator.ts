import type { Clock } from '../../../shared/ports/clock.js';
import type { Result } from '../../../shared/result.js';
import type {
  JobRouteEstimator,
  RouteEstimate,
  RouteUnavailable,
} from '../application/ports/route-estimator.js';
import type { GeoPoint, VehicleId } from '../domain/job.js';

/** Five minutes, per design doc §6: "refreshed every few minutes rather than on every ping to keep
 *  Valhalla load low". The dashboard polls every 10 seconds; without this each poll would plan a
 *  route per vehicle. */
export const ROUTE_ESTIMATE_TTL_MS = 5 * 60_000;

// Three decimal places is about 110 m: a lorry that has moved a few metres since the last estimate
// hits the same entry, one that has made real progress does not.
const key = (vehicleId: VehicleId, from: GeoPoint, to: GeoPoint) =>
  [vehicleId, from.lat.toFixed(3), from.lon.toFixed(3), to.lat.toFixed(3), to.lon.toFixed(3)].join(
    '|',
  );

/**
 * Remembers each estimate for `ROUTE_ESTIMATE_TTL_MS`. In memory and per process, which is all a
 * few firms on one core instance need; a second instance would just compute its own. Failures are
 * remembered too, so a vehicle with no possible route doesn't re-plan on every poll. A thrown
 * fault (the routing engine being down) is deliberately *not* cached, so recovery is immediate.
 */
export class CachingRouteEstimator implements JobRouteEstimator {
  readonly #entries = new Map<
    string,
    { expiresAt: number; result: Result<RouteEstimate, RouteUnavailable> }
  >();

  constructor(
    private readonly inner: JobRouteEstimator,
    private readonly clock: Clock,
    private readonly ttlMs: number = ROUTE_ESTIMATE_TTL_MS,
  ) {}

  async estimate(input: {
    readonly vehicleId: VehicleId;
    readonly from: GeoPoint;
    readonly to: GeoPoint;
  }): Promise<Result<RouteEstimate, RouteUnavailable>> {
    const now = this.clock.now().getTime();
    const k = key(input.vehicleId, input.from, input.to);
    const cached = this.#entries.get(k);
    if (cached !== undefined && cached.expiresAt > now) return cached.result;

    const result = await this.inner.estimate(input);
    this.#entries.set(k, { expiresAt: now + this.ttlMs, result });
    this.#sweep(now);
    return result;
  }

  /** Drops expired entries so a long-running process doesn't keep every route it ever planned. */
  #sweep(now: number): void {
    for (const [k, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(k);
    }
  }
}
