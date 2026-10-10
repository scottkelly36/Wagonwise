import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { ActiveTripId } from '../domain/active-trip.js';
import { applies } from '../domain/avoidance-policy.js';
import {
  CONGESTION_ON_ROUTE_RADIUS_M,
  MAX_OFFERS_PER_HOUR,
  MAX_OFF_ROUTE_M,
  MIN_REMAINING_MIN,
  MIN_TRAFFIC_COVERAGE,
  OFFER_GAP_MS,
  OFFER_WINDOW_MS,
  minutesForShareOf,
  nearestVertex,
  pathLengthM,
  requiredSavingMin,
  routeKey,
  totalMinutes,
} from '../domain/faster-route.js';
import {
  AVOID_ZONE_HALF_WIDTH_M,
  ON_ROUTE_RADIUS_M,
  bufferPoint,
  decodePolyline,
  type GeoPoint,
  type GeoPolygon,
} from '../domain/geo.js';
import { toReportedObstruction } from '../domain/restriction-override.js';
import { estimateFuelCostGBP } from '../domain/route-option.js';
import type { RoutePlan, RoutePlanId } from '../domain/route-plan.js';
import type { Dimensions, DriverId } from '../domain/vehicle-profile.js';
import type { ActiveTripNotFound } from './errors.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { CongestionQuery } from './ports/congestion-query.js';
import type { FasterRouteOfferLog } from './ports/faster-route-offer-log.js';
import type { HazardAvoidanceQuery } from './ports/hazard-avoidance.js';
import type { HazardsOnRouteQuery } from './ports/hazards-on-route.js';
import type { RestrictionOverrideRepository } from './ports/restriction-override-repository.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { RouteResult, RoutingEngine } from './ports/routing-engine.js';
import type { TrafficQuery } from './ports/traffic-query.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface CheckFasterRouteDeps {
  readonly activeTripRepo: ActiveTripRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly routingEngine: RoutingEngine;
  readonly hazardAvoidanceQuery: HazardAvoidanceQuery;
  readonly hazardsOnRouteQuery: HazardsOnRouteQuery;
  readonly restrictionOverrideRepo: RestrictionOverrideRepository;
  readonly congestionQuery: CongestionQuery;
  readonly trafficQuery: TrafficQuery;
  readonly offerLog: FasterRouteOfferLog;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly fuelPricePerLitreGBP: number;
}

export interface CheckFasterRouteInput {
  readonly driverId: DriverId;
  readonly tripId: ActiveTripId;
  /** Where the lorry is now. Core does not track it, so the app sends it with every check. */
  readonly position: GeoPoint;
  readonly headingDeg?: number | undefined;
  /** Keys of offers the driver has already kept their route over; never offered again on this trip. */
  readonly keptKeys: readonly string[];
}

export interface FasterRouteOffer {
  /** A saved plan from the driver's position, which the app shows and switches to like a reroute. */
  readonly routePlanId: RoutePlanId;
  readonly key: string;
  readonly savingMinutes: number;
  /** Time left on each route, with traffic. */
  readonly currentMinutes: number;
  readonly alternativeMinutes: number;
}

interface Timed {
  readonly freeFlowMin: number;
  readonly crowdWaitMin: number;
  readonly trafficDelaySec: number;
  readonly trafficCoverage: number;
}

async function measure(
  deps: Pick<CheckFasterRouteDeps, 'congestionQuery' | 'trafficQuery'>,
  line: readonly GeoPoint[],
  freeFlowMin: number,
): Promise<Timed> {
  const waits = await deps.congestionQuery.waitsNear(line, CONGESTION_ON_ROUTE_RADIUS_M);
  const traffic = await deps.trafficQuery.delayAlong(line);
  return {
    freeFlowMin,
    crowdWaitMin: waits.reduce((sum, w) => sum + w.waitMinutes, 0),
    trafficDelaySec: traffic.delaySeconds,
    trafficCoverage: traffic.coverage,
  };
}

/**
 * While a driver is navigating: is there a clearly quicker route to the same destination, counting
 * live congestion (drivers' reports) and the traffic provider's delays? Docs: `docs/faster-route-scope.md`.
 *
 * It only ever chooses between routes that are already allowed for this vehicle. Candidates come from the engine
 * with the vehicle's dimensions and every blocking hazard and restriction as an avoid area, and each one is
 * checked again against those hazards before it can be offered; traffic can make a route look slower, never
 * less cautious. It offers; it never switches. Returns `null` when there is nothing worth saying.
 */
export async function checkFasterRoute(
  deps: CheckFasterRouteDeps,
  input: CheckFasterRouteInput,
): Promise<Result<FasterRouteOffer | null, ActiveTripNotFound>> {
  const trip = await deps.activeTripRepo.findById(input.tripId);
  if (!trip || trip.driverId !== input.driverId) return err({ tag: 'ActiveTripNotFound' });
  if (trip.endedAt !== undefined) return ok(null);

  const plan = await deps.routePlanRepo.findById(trip.routePlanId);
  if (!plan) return err({ tag: 'ActiveTripNotFound' });
  const profile = await deps.vehicleProfileRepo.findById(plan.profileId);
  if (!profile) return ok(null);

  const now = deps.clock.now();
  const recent = await deps.offerLog.offersSince(
    trip.id,
    new Date(now.getTime() - OFFER_WINDOW_MS),
  );
  const last = recent[recent.length - 1];
  if (recent.length >= MAX_OFFERS_PER_HOUR) return ok(null);
  if (last !== undefined && now.getTime() - last.getTime() < OFFER_GAP_MS) return ok(null);

  // The rest of the planned route, from the vehicle's nearest point on it.
  const planned = decodePolyline(plan.geometry);
  const nearest = nearestVertex(planned, input.position);
  if (nearest === undefined || nearest.distanceM > MAX_OFF_ROUTE_M) return ok(null);
  const remaining = planned.slice(nearest.index);
  const remainingFreeFlowMin = minutesForShareOf(
    plan.durationMin,
    pathLengthM(remaining),
    pathLengthM(planned),
  );
  if (remainingFreeFlowMin < MIN_REMAINING_MIN) return ok(null);

  const current = await measure(deps, remaining, remainingFreeFlowMin);

  // Everything that blocks this vehicle near the planned route stays an avoid area for the alternatives.
  const blocking = await blockingNear(deps, plan.geometry, profile.dimensions);
  const blockingZones = blocking.map((o) => o.zone);

  const candidates: RouteResult[] = [];
  const request = {
    origin: input.position,
    originHeadingDeg: input.headingDeg,
    destination: plan.destination,
    dimensions: profile.dimensions,
  };
  const alternatives = await deps.routingEngine.routeAlternatives({
    ...request,
    avoid: blockingZones,
  });
  if (alternatives.ok) candidates.push(...alternatives.value);

  // A route that steers clear of the spots where drivers report waiting.
  const waitsAhead = await deps.congestionQuery.waitsNear(remaining, CONGESTION_ON_ROUTE_RADIUS_M);
  if (waitsAhead.length > 0) {
    const congestionZones: GeoPolygon[] = waitsAhead.map((w) =>
      bufferPoint(w.location, AVOID_ZONE_HALF_WIDTH_M),
    );
    const around = await deps.routingEngine.route({
      ...request,
      avoid: [...blockingZones, ...congestionZones],
    });
    if (around.ok) candidates.push(around.value);
  }

  const kept = new Set(input.keptKeys);
  let best:
    { route: RouteResult; minutes: number; currentMinutes: number; key: string } | undefined;
  for (const route of candidates) {
    const key = routeKey(route.geometry);
    if (kept.has(key)) continue;
    // Engine alternatives can ignore avoid areas: refuse any that still pass a blocking obstruction.
    if ((await blockingNear(deps, route.geometry, profile.dimensions)).length > 0) continue;

    const timed = await measure(deps, decodePolyline(route.geometry), route.durationMin);
    // Compare like with like: a provider delay counts only when both routes have enough readings.
    const useTraffic =
      current.trafficCoverage >= MIN_TRAFFIC_COVERAGE &&
      timed.trafficCoverage >= MIN_TRAFFIC_COVERAGE;
    const candidateMinutes = totalMinutes({
      ...timed,
      trafficDelaySec: useTraffic ? timed.trafficDelaySec : undefined,
    });
    const currentMinutes = totalMinutes({
      ...current,
      trafficDelaySec: useTraffic ? current.trafficDelaySec : undefined,
    });
    if (currentMinutes - candidateMinutes < requiredSavingMin(currentMinutes)) continue;
    if (best === undefined || candidateMinutes < best.minutes) {
      best = { route, minutes: candidateMinutes, currentMinutes, key };
    }
  }
  if (best === undefined) return ok(null);

  const newPlan: RoutePlan = {
    id: makeId<'RoutePlanId'>(deps.ids.newId()),
    driverId: input.driverId,
    profileId: plan.profileId,
    origin: input.position,
    destination: plan.destination,
    geometry: best.route.geometry,
    distanceKm: best.route.distanceKm,
    durationMin: best.route.durationMin,
    avoidedRestrictions: [],
    maneuvers: best.route.maneuvers,
    hazardsOnRoute: await deps.hazardsOnRouteQuery.idsNear(best.route.geometry),
    createdAt: now,
    estimatedFuelCostGBP: estimateFuelCostGBP(
      best.route.distanceKm,
      profile.fuelConsumptionL100km,
      deps.fuelPricePerLitreGBP,
    ),
  };
  await deps.routePlanRepo.save(newPlan);
  await deps.offerLog.record(trip.id, now);

  return ok({
    routePlanId: newPlan.id,
    key: best.key,
    savingMinutes: Math.round(best.currentMinutes - best.minutes),
    currentMinutes: Math.round(best.currentMinutes),
    alternativeMinutes: Math.round(best.minutes),
  });
}

/** Reported hazards and audited restrictions near a line that block a vehicle of these dimensions. */
async function blockingNear(
  deps: Pick<CheckFasterRouteDeps, 'hazardAvoidanceQuery' | 'restrictionOverrideRepo'>,
  geometry: string,
  dimensions: Dimensions,
) {
  const hazards = await deps.hazardAvoidanceQuery.activeNear(geometry);
  const overrides = await deps.restrictionOverrideRepo.findNearbyLine(
    decodePolyline(geometry),
    ON_ROUTE_RADIUS_M,
  );
  return [...hazards, ...overrides.map(toReportedObstruction)].filter((o) =>
    applies(o, dimensions),
  );
}
