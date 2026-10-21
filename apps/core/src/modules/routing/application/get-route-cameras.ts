import { err, ok, type Result } from '../../../shared/result.js';
import type { RouteCamera } from '../domain/route-camera.js';
import type { RoutePlanId } from '../domain/route-plan.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { RoutePlanNotFound } from './errors.js';
import type { CamerasOnRouteQuery } from './ports/cameras-on-route.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';

export interface GetRouteCamerasDeps {
  readonly routePlanRepo: RoutePlanRepository;
  readonly camerasOnRoute: CamerasOnRouteQuery;
}

export interface GetRouteCamerasInput {
  readonly id: RoutePlanId;
  readonly driverId: DriverId;
}

/** The cameras along one of the driver's route plans. Another driver's plan looks the same as an unknown one. */
export async function getRouteCameras(
  deps: GetRouteCamerasDeps,
  input: GetRouteCamerasInput,
): Promise<Result<RouteCamera[], RoutePlanNotFound>> {
  const plan = await deps.routePlanRepo.findById(input.id);
  if (!plan || plan.driverId !== input.driverId) return err({ tag: 'RoutePlanNotFound' });
  return ok(await deps.camerasOnRoute.camerasNear(plan.geometry));
}
