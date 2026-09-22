import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { GeoPoint } from '../domain/geo.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { NoRouteFound, RoutingEngine } from './ports/routing-engine.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface PlanRouteDeps {
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly routingEngine: RoutingEngine;
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
 * Plans a route for one of a driver's vehicle profiles (design doc §4): looks up the profile's
 * dimensions, asks the `RoutingEngine` for a truck-aware route, and persists the result.
 *
 * Two things design doc §4/§5 describe are deliberately not here yet (docs/progress.md, M2.5
 * deviations): community-hazard avoidance (`avoid` is always empty — needs a hazards read-model
 * port, M3) and the avoided-restriction explanation (needs OSM restriction data core doesn't
 * have direct access to yet). `RoutePlan.avoidedRestrictions` and `.hazardsOnRoute` are always
 * empty for the same reasons.
 */
export async function planRoute(
  deps: PlanRouteDeps,
  input: PlanRouteInput,
): Promise<Result<RoutePlan, PlanRouteError>> {
  const profile = await deps.vehicleProfileRepo.findById(input.profileId);
  if (!profile || profile.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }

  const routed = await deps.routingEngine.route({
    origin: input.origin,
    destination: input.destination,
    dimensions: profile.dimensions,
    avoid: [],
  });
  if (!routed.ok) {
    return routed;
  }

  const plan: RoutePlan = {
    id: makeId<'RoutePlanId'>(deps.ids.newId()),
    driverId: input.driverId,
    profileId: input.profileId,
    origin: input.origin,
    destination: input.destination,
    geometry: routed.value.geometry,
    distanceKm: routed.value.distanceKm,
    durationMin: routed.value.durationMin,
    avoidedRestrictions: [],
    hazardsOnRoute: [],
    createdAt: deps.clock.now(),
  };
  await deps.routePlanRepo.save(plan);
  return ok(plan);
}
