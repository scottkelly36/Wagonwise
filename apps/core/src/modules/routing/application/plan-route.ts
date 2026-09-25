import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { applies } from '../domain/avoidance-policy.js';
import { decodePolyline, ON_ROUTE_RADIUS_M, type GeoPoint } from '../domain/geo.js';
import { describeAvoidedOverride, toReportedObstruction } from '../domain/restriction-override.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { HazardAvoidanceQuery } from './ports/hazard-avoidance.js';
import type { RestrictionOverrideRepository } from './ports/restriction-override-repository.js';
import type { NoRouteFound, RoutingEngine } from './ports/routing-engine.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface PlanRouteDeps {
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly routingEngine: RoutingEngine;
  readonly hazardAvoidanceQuery: HazardAvoidanceQuery;
  readonly restrictionOverrideRepo: RestrictionOverrideRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface PlanRouteInput {
  readonly driverId: DriverId;
  readonly profileId: VehicleProfileId;
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
}

export type PlanRouteError = VehicleProfileNotFound | NoRouteFound;

/**
 * Plans a route for one of a driver's vehicle profiles (design doc §4/§5): looks up the profile's
 * dimensions, asks the `RoutingEngine` for a truck-aware route, checks whether any active hazard
 * or manually-audited restriction override near that route applies to this vehicle (`applies()`,
 * M2.4), and — only if one does — re-plans once more with avoid polygons around them. Two-pass by
 * necessity: `RoutingEngine.route()` needs `avoid` before a route's geometry exists to check
 * against, so the first pass finds out what's actually nearby and the second (only when needed)
 * avoids it.
 *
 * The avoided-restriction explanation (design doc §4) is still incomplete (docs/progress.md, M2.5
 * deviations — real OSM restriction data isn't available to core), but a restriction override
 * (M8's test-area audit, `restriction-override.ts`) *is* a known, described fact, so an avoided
 * override now populates `avoidedRestrictions` for real; an avoided hazard still doesn't (there's
 * no human-written description to build one from). `hazardsOnRoute` stays empty for now —
 * `HazardAvoidanceQuery` is scoped to blocking-type avoidance candidates only (decision, M3.5),
 * not the broader "every hazard near this route" a display feature would need.
 */
export async function planRoute(
  deps: PlanRouteDeps,
  input: PlanRouteInput,
): Promise<Result<RoutePlan, PlanRouteError>> {
  const profile = await deps.vehicleProfileRepo.findById(input.profileId);
  if (!profile || profile.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }

  const firstPass = await deps.routingEngine.route({
    origin: input.origin,
    destination: input.destination,
    dimensions: profile.dimensions,
    avoid: [],
  });
  if (!firstPass.ok) {
    return firstPass;
  }

  const hazardCandidates = await deps.hazardAvoidanceQuery.activeNear(firstPass.value.geometry);
  const overrides = await deps.restrictionOverrideRepo.findNearbyLine(
    decodePolyline(firstPass.value.geometry),
    ON_ROUTE_RADIUS_M,
  );
  const overrideCandidates = overrides.map(toReportedObstruction);

  const nearby = [...hazardCandidates, ...overrideCandidates];
  const blocking = nearby.filter((obstruction) => applies(obstruction, profile.dimensions));

  let routed = firstPass.value;
  if (blocking.length > 0) {
    const secondPass = await deps.routingEngine.route({
      origin: input.origin,
      destination: input.destination,
      dimensions: profile.dimensions,
      avoid: blocking.map((obstruction) => obstruction.zone),
    });
    if (!secondPass.ok) {
      return secondPass;
    }
    routed = secondPass.value;
  }

  const blockingIds = new Set(blocking.map((obstruction) => obstruction.id));
  const avoidedRestrictions = overrides
    .filter((override) => blockingIds.has(override.id))
    .map(describeAvoidedOverride);

  const plan: RoutePlan = {
    id: makeId<'RoutePlanId'>(deps.ids.newId()),
    driverId: input.driverId,
    profileId: input.profileId,
    origin: input.origin,
    destination: input.destination,
    geometry: routed.geometry,
    distanceKm: routed.distanceKm,
    durationMin: routed.durationMin,
    avoidedRestrictions,
    hazardsOnRoute: [],
    createdAt: deps.clock.now(),
  };
  await deps.routePlanRepo.save(plan);
  return ok(plan);
}
