import { err, ok, type Result } from '../../../shared/result.js';
import type { ActiveTripId } from '../domain/active-trip.js';
import {
  CONGESTION_ON_ROUTE_RADIUS_M,
  MAX_OFF_ROUTE_M,
  nearestVertex,
  pathLengthM,
} from '../domain/faster-route.js';
import { decodePolyline, type GeoPoint } from '../domain/geo.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { ActiveTripNotFound } from './errors.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { CongestionQuery } from './ports/congestion-query.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { TrafficQuery } from './ports/traffic-query.js';

export interface GetTripTrafficDeps {
  readonly activeTripRepo: ActiveTripRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly congestionQuery: CongestionQuery;
  readonly trafficQuery: TrafficQuery;
}

export interface GetTripTrafficInput {
  readonly driverId: DriverId;
  readonly tripId: ActiveTripId;
  /** Where the lorry is now. Core does not track it, so the app sends it. */
  readonly position: GeoPoint;
}

export interface TripTraffic {
  /** Whether live traffic is switched on at all (a provider key is set). */
  readonly enabled: boolean;
  /** Minutes traffic and drivers' congestion reports add to the rest of the route. */
  readonly extraMinutes: number;
  /** Share (0 to 1) of the rest of the route the provider had a reading for. Below 1 the delay is a lower bound. */
  readonly coverage: number;
  /** Where on the whole route traffic is held up, as fractions of its length (0 to 1), ahead of the lorry. */
  readonly stretches: readonly {
    readonly from: number;
    readonly to: number;
    readonly level: 'slow' | 'heavy';
  }[];
}

/**
 * How much live traffic and other drivers' congestion reports add to what is left of the route, so the app can put it into the
 * arrival time. The route's own time is the clear-road time; this is the extra. Never fails the trip: off the route, or a trip
 * that has ended, is no delay.
 */
export async function getTripTraffic(
  deps: GetTripTrafficDeps,
  input: GetTripTrafficInput,
): Promise<Result<TripTraffic, ActiveTripNotFound>> {
  const none: TripTraffic = {
    enabled: deps.trafficQuery.enabled,
    extraMinutes: 0,
    coverage: 0,
    stretches: [],
  };
  const trip = await deps.activeTripRepo.findById(input.tripId);
  if (!trip || trip.driverId !== input.driverId) return err({ tag: 'ActiveTripNotFound' });
  if (trip.endedAt !== undefined) return ok(none);

  const plan = await deps.routePlanRepo.findById(trip.routePlanId);
  if (!plan) return err({ tag: 'ActiveTripNotFound' });

  const planned = decodePolyline(plan.geometry);
  const nearest = nearestVertex(planned, input.position);
  if (nearest === undefined || nearest.distanceM > MAX_OFF_ROUTE_M) return ok(none);
  const remaining = planned.slice(nearest.index);

  const traffic = await deps.trafficQuery.delayAlong(remaining);
  const waits = await deps.congestionQuery.waitsNear(remaining, CONGESTION_ON_ROUTE_RADIUS_M);
  const reportedMin = waits.reduce((sum, w) => sum + w.waitMinutes, 0);
  // The stretches are measured from the lorry; the app wants them as fractions of the whole route.
  const behindM = pathLengthM(planned.slice(0, nearest.index + 1));
  const totalM = behindM + pathLengthM(remaining);
  const fraction = (metres: number): number =>
    totalM <= 0 ? 0 : Math.min(1, Math.round(((behindM + metres) / totalM) * 10_000) / 10_000);
  return ok({
    stretches: (traffic.stretches ?? []).map((t) => ({
      from: fraction(t.fromM),
      to: fraction(t.toM),
      level: t.level,
    })),
    enabled: deps.trafficQuery.enabled,
    extraMinutes: Math.max(0, Math.round(traffic.delaySeconds / 60 + reportedMin)),
    coverage: traffic.coverage,
  });
}
