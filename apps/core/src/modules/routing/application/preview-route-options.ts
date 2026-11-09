import { err, ok, type Result } from '../../../shared/result.js';
import { buildRouteOptions, summariseHills, type RouteOption } from '../domain/route-option.js';
import type { GeoPoint } from '../domain/geo.js';
import {
  withoutWeightLimits,
  type DriverId,
  type VehicleProfileId,
} from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import { findGentlestRoute } from './gentle-route.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from './ports/routing-engine.js';
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
  /** The vehicle is loaded: check the hills on each route, look for a gentler one, and mark it `gentle`. Without heights from the engine this
   *  changes nothing (no option carries `hills`). */
  readonly loaded?: boolean | undefined;
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
        await withHills(deps.routingEngine, request, alternatives.value, input.loaded),
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
      await withHills(
        deps.routingEngine,
        { ...request, dimensions: withoutWeightLimits(profile.dimensions) },
        ignoringWeight.value,
        input.loaded,
      ),
      profile.fuelConsumptionL100km,
      deps.fuelPricePerLitreGBP,
    ).map((option) => ({ ...option, breaksWeightLimit: true })),
  );
}

/**
 * The routes with how hilly each is, when the vehicle is loaded and the engine has heights, and the least steep marked `gentle`: the
 * engine's routes plus any found by avoiding the steep stretches of the best. Otherwise the routes just as they are.
 */
async function withHills(
  engine: RoutingEngine,
  request: RouteRequest,
  routes: readonly RouteResult[],
  loaded: boolean | undefined,
) {
  if (loaded !== true) return routes;
  const search = await findGentlestRoute(engine, request, routes);
  if (search === undefined) return routes;
  // The engine's own routes, and the gentlest if a search found it (it is made again by `strategy: 'gentle'`). The other routes the search
  // tried are left out: a route called "shortest" that planning could not make again would be a different route when planned.
  return search.candidates
    .filter((c) => c.hillZones.length === 0 || c === search.gentlest)
    .map((c) => ({
      ...c.route,
      hills: summariseHills(c.stats),
      gentle: c === search.gentlest,
    }));
}
