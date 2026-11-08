import { err, ok, type Result } from '../../../shared/result.js';
import { buildRouteOptions, type RouteOption } from '../domain/route-option.js';
import type { GeoPoint } from '../domain/geo.js';
import {
  withoutWeightLimits,
  type DriverId,
  type VehicleProfileId,
} from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { NoRouteFound, RoutingEngine } from './ports/routing-engine.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface PreviewRouteOptionsDeps {
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly routingEngine: RoutingEngine;
  readonly fuelPricePerLitreGBP: number;
}

export interface PreviewRouteOptionsInput {
  readonly driverId: DriverId;
  readonly profileId: VehicleProfileId;
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
}

export type PreviewRouteOptionsError = VehicleProfileNotFound | NoRouteFound;

/**
 * M9 (docs/progress.md): lets a driver compare fastest/shortest before committing to a plan.
 * Deliberately unpersisted and hazard-agnostic — this is a rough preview to help pick a strategy,
 * not a substitute for `planRoute`'s real hazard/restriction avoidance. Once a driver picks one
 * (or picks nothing, which defaults to `'fastest'`), the actual `POST /routing/route-plans` call
 * carries that choice as `strategy` and runs the full avoidance pass for real before persisting
 * anything — this use case never writes a `RoutePlan` row itself.
 */
export async function previewRouteOptions(
  deps: PreviewRouteOptionsDeps,
  input: PreviewRouteOptionsInput,
): Promise<Result<readonly RouteOption[], PreviewRouteOptionsError>> {
  const profile = await deps.vehicleProfileRepo.findById(input.profileId);
  if (!profile || profile.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }

  const request = {
    origin: input.origin,
    destination: input.destination,
    dimensions: profile.dimensions,
    avoid: [],
  };
  const alternatives = await deps.routingEngine.routeAlternatives(request);
  if (alternatives.ok) {
    return ok(
      buildRouteOptions(
        alternatives.value,
        profile.fuelConsumptionL100km,
        deps.fuelPricePerLitreGBP,
      ),
    );
  }

  // Only when there is no route for the real weight: look for one that ignores weight limits, and mark it so the driver is
  // warned and has to choose it. A signed limit may still allow access for a delivery; the engine cannot tell. Height and
  // width are never relaxed, so a route that fails for those stays "no route".
  const ignoringWeight = await deps.routingEngine.routeAlternatives({
    ...request,
    dimensions: withoutWeightLimits(profile.dimensions),
  });
  if (!ignoringWeight.ok) {
    return alternatives;
  }
  return ok(
    buildRouteOptions(
      ignoringWeight.value,
      profile.fuelConsumptionL100km,
      deps.fuelPricePerLitreGBP,
    ).map((option) => ({ ...option, breaksWeightLimit: true })),
  );
}
