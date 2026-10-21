import { err, ok, type Result } from '../../../shared/result.js';
import type { RoutePlanId } from '../domain/route-plan.js';
import type { SpeedZone } from '../domain/speed-zone.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { RoutePlanNotFound } from './errors.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { SpeedLimitSource } from './ports/speed-limit-source.js';

export interface GetRouteSpeedLimitsDeps {
  readonly routePlanRepo: RoutePlanRepository;
  readonly speedLimits: SpeedLimitSource;
}

export interface GetRouteSpeedLimitsInput {
  readonly id: RoutePlanId;
  readonly driverId: DriverId;
}

/**
 * The speed limits to show along one of the driver's route plans. Another driver's plan looks the same as an unknown
 * one, as `getRoutePlan` does.
 */
export async function getRouteSpeedLimits(
  deps: GetRouteSpeedLimitsDeps,
  input: GetRouteSpeedLimitsInput,
): Promise<Result<SpeedZone[], RoutePlanNotFound>> {
  const plan = await deps.routePlanRepo.findById(input.id);
  if (!plan || plan.driverId !== input.driverId) return err({ tag: 'RoutePlanNotFound' });
  return ok(await deps.speedLimits.zonesAlong(plan.geometry));
}
