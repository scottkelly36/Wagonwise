import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { applies } from '../domain/avoidance-policy.js';
import { decodePolyline, ON_ROUTE_RADIUS_M, type GeoPoint } from '../domain/geo.js';
import { describeAvoidedOverride, toReportedObstruction } from '../domain/restriction-override.js';
import { estimateFuelCostGBP } from '../domain/route-option.js';
import type { Maneuver } from '../domain/maneuver.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { HazardAvoidanceQuery } from './ports/hazard-avoidance.js';
import type { HazardsOnRouteQuery } from './ports/hazards-on-route.js';
import type { RestrictionOverrideRepository } from './ports/restriction-override-repository.js';
import type { NoRouteFound, RoutingEngine } from './ports/routing-engine.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface PlanRouteDeps {
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly routingEngine: RoutingEngine;
  readonly hazardAvoidanceQuery: HazardAvoidanceQuery;
  readonly hazardsOnRouteQuery: HazardsOnRouteQuery;
  readonly restrictionOverrideRepo: RestrictionOverrideRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** M9's rough fuel-cost estimate — one app-wide constant (`config.fuelPricePerLitreGBP`), not a
   *  live price feed (docs/progress.md's M9 scoping). */
  readonly fuelPricePerLitreGBP: number;
}

export interface PlanRouteInput {
  readonly driverId: DriverId;
  readonly profileId: VehicleProfileId;
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
  /** The alternative the driver picked after previewing options via `previewRouteOptions` (M9) —
   *  undefined (today's only behaviour, before M9) means "just the engine's primary route," same
   *  as `'fastest'`. Only `'shortest'` changes what gets requested: the first pass calls
   *  `routeAlternatives` instead of `route` and picks the shortest-distance candidate, then
   *  hazard-avoidance proceeds exactly as before against whichever geometry was chosen. If a
   *  blocking hazard then forces a second pass, that pass always asks for a single, already-
   *  avoiding route — the "shortest" preference doesn't carry through a re-plan, an accepted
   *  edge case (safety-avoidance wins over a distance preference). */
  readonly strategy?: 'fastest' | 'shortest' | undefined;
  /** The direction the driver is already travelling, so a re-plan from the middle of a drive does not
   *  start by sending them back the way they came. */
  readonly originHeadingDeg?: number | undefined;
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
 * no human-written description to build one from). `hazardsOnRoute` is a separate, broader query
 * (`HazardsOnRouteQuery`, every hazard type near the *final* routed line) — `HazardAvoidanceQuery`
 * above stays scoped to blocking-type candidates only (decision, M3.5), since re-planning around
 * a hazard and telling a driver one is nearby are different questions with different answers.
 */
export async function planRoute(
  deps: PlanRouteDeps,
  input: PlanRouteInput,
): Promise<Result<RoutePlan, PlanRouteError>> {
  const profile = await deps.vehicleProfileRepo.findById(input.profileId);
  if (!profile || profile.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }

  let firstPassGeometry: string;
  let firstPassDistanceKm: number;
  let firstPassDurationMin: number;
  let firstPassManeuvers: readonly Maneuver[];
  if (input.strategy === 'shortest') {
    const alternatives = await deps.routingEngine.routeAlternatives({
      origin: input.origin,
      originHeadingDeg: input.originHeadingDeg,
      destination: input.destination,
      dimensions: profile.dimensions,
      avoid: [],
    });
    if (!alternatives.ok) {
      return alternatives;
    }
    const shortest = alternatives.value.reduce((min, r) =>
      r.distanceKm < min.distanceKm ? r : min,
    );
    firstPassGeometry = shortest.geometry;
    firstPassDistanceKm = shortest.distanceKm;
    firstPassDurationMin = shortest.durationMin;
    firstPassManeuvers = shortest.maneuvers;
  } else {
    const firstPass = await deps.routingEngine.route({
      origin: input.origin,
      originHeadingDeg: input.originHeadingDeg,
      destination: input.destination,
      dimensions: profile.dimensions,
      avoid: [],
    });
    if (!firstPass.ok) {
      return firstPass;
    }
    firstPassGeometry = firstPass.value.geometry;
    firstPassDistanceKm = firstPass.value.distanceKm;
    firstPassDurationMin = firstPass.value.durationMin;
    firstPassManeuvers = firstPass.value.maneuvers;
  }

  const hazardCandidates = await deps.hazardAvoidanceQuery.activeNear(firstPassGeometry);
  const overrides = await deps.restrictionOverrideRepo.findNearbyLine(
    decodePolyline(firstPassGeometry),
    ON_ROUTE_RADIUS_M,
  );
  const overrideCandidates = overrides.map(toReportedObstruction);

  const nearby = [...hazardCandidates, ...overrideCandidates];
  const blocking = nearby.filter((obstruction) => applies(obstruction, profile.dimensions));

  let routed = {
    geometry: firstPassGeometry,
    distanceKm: firstPassDistanceKm,
    durationMin: firstPassDurationMin,
    maneuvers: firstPassManeuvers,
  };
  if (blocking.length > 0) {
    const secondPass = await deps.routingEngine.route({
      origin: input.origin,
      originHeadingDeg: input.originHeadingDeg,
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

  // Against `routed`, not `firstPass` — a driver reading "hazards on this route" means the route
  // they're actually about to take, which after a second pass may no longer pass near a hazard
  // the first pass did (or may pass near a different one it didn't).
  const hazardsOnRoute = await deps.hazardsOnRouteQuery.idsNear(routed.geometry);

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
    maneuvers: routed.maneuvers,
    hazardsOnRoute,
    createdAt: deps.clock.now(),
    estimatedFuelCostGBP: estimateFuelCostGBP(
      routed.distanceKm,
      profile.fuelConsumptionL100km,
      deps.fuelPricePerLitreGBP,
    ),
  };
  await deps.routePlanRepo.save(plan);
  return ok(plan);
}
