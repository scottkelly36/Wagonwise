import {
  activeTripSchema,
  createVehicleProfileRequestSchema,
  planRouteRequestSchema,
  routePlanSchema,
  vehicleProfileSchema,
  type ActiveTripDto,
  type CreateVehicleProfileRequest,
  type PlanRouteRequest,
  type RoutePlanDto,
  type VehicleProfileDto,
} from '@wagonwise/contracts/routing';
import { z } from 'zod';

import { requestJson, throwUnlessSuccess } from './http';

const vehicleProfileListSchema = z.array(vehicleProfileSchema);

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export async function listVehicleProfiles(accessToken: string): Promise<VehicleProfileDto[]> {
  const { status, json } = await requestJson('GET', '/routing/vehicle-profiles', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return vehicleProfileListSchema.parse(json);
}

export async function getVehicleProfile(
  accessToken: string,
  id: string,
): Promise<VehicleProfileDto> {
  const { status, json } = await requestJson('GET', `/routing/vehicle-profiles/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return vehicleProfileSchema.parse(json);
}

export async function createVehicleProfile(
  accessToken: string,
  input: CreateVehicleProfileRequest,
): Promise<VehicleProfileDto> {
  const body = createVehicleProfileRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/routing/vehicle-profiles', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return vehicleProfileSchema.parse(json);
}

/** Same request shape as create — `updateVehicleProfileRequestSchema` and
 *  `createVehicleProfileRequestSchema` are structurally identical (packages/contracts/routing.ts),
 *  so this reuses the create request's inferred type rather than importing a second schema that
 *  would parse identically. */
export async function updateVehicleProfile(
  accessToken: string,
  id: string,
  input: CreateVehicleProfileRequest,
): Promise<VehicleProfileDto> {
  const body = createVehicleProfileRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/routing/vehicle-profiles/${id}`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return vehicleProfileSchema.parse(json);
}

export async function deleteVehicleProfile(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/routing/vehicle-profiles/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

export async function planRoute(
  accessToken: string,
  input: PlanRouteRequest,
): Promise<RoutePlanDto> {
  const body = planRouteRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/routing/route-plans', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return routePlanSchema.parse(json);
}

export async function startTrip(accessToken: string, routePlanId: string): Promise<ActiveTripDto> {
  const { status, json } = await requestJson('POST', `/routing/route-plans/${routePlanId}/trip`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return activeTripSchema.parse(json);
}

export async function endTrip(accessToken: string, tripId: string): Promise<ActiveTripDto> {
  const { status, json } = await requestJson('POST', `/routing/trips/${tripId}/end`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return activeTripSchema.parse(json);
}
