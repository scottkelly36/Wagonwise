import { err, ok, type Result } from '../../../shared/result.js';
import { buildRouteOptions, type RouteOption } from '../domain/route-option.js';
import type { GeoPoint } from '../domain/geo.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
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

  const alternatives = await deps.routingEngine.routeAlternatives({
    origin: input.origin,
    destination: input.destination,
    dimensions: profile.dimensions,
    avoid: [],
  });
  if (!alternatives.ok) {
    return alternatives;
  }

  return ok(
    buildRouteOptions(alternatives.value, profile.fuelConsumptionL100km, deps.fuelPricePerLitreGBP),
  );
}
