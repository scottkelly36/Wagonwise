import { err, ok, type Result } from '../../../shared/result.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { RoutePlan, RoutePlanId } from '../domain/route-plan.js';
import type { RoutePlanNotFound } from './errors.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';

export interface GetRoutePlanDeps {
  readonly routePlanRepo: RoutePlanRepository;
}

export interface GetRoutePlanInput {
  readonly id: RoutePlanId;
  readonly driverId: DriverId;
}

export type GetRoutePlanError = RoutePlanNotFound;

/** A driverId mismatch is the same `RoutePlanNotFound` as a genuinely unknown id (decision 49's
 *  precedent) — telling the two apart would leak that another driver's plan exists. */
export async function getRoutePlan(
  deps: GetRoutePlanDeps,
  input: GetRoutePlanInput,
): Promise<Result<RoutePlan, GetRoutePlanError>> {
  const plan = await deps.routePlanRepo.findById(input.id);
  if (!plan || plan.driverId !== input.driverId) {
    return err({ tag: 'RoutePlanNotFound' });
  }
  return ok(plan);
}
