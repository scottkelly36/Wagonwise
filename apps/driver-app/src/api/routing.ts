import {
  activeTripSchema,
  createVehicleProfileRequestSchema,
  fasterRouteCheckRequestSchema,
  fasterRouteCheckResponseSchema,
  findActiveTripResponseSchema,
  planRouteRequestSchema,
  previewRouteOptionsRequestSchema,
  previewRouteOptionsResponseSchema,
  routePlanSchema,
  tripTrafficSchema,
  routeSpeedLimitsSchema,
  vehicleProfileSchema,
  type ActiveTripDto,
  type CreateVehicleProfileRequest,
  type FasterRouteCheckRequest,
  type FasterRouteCheckResponse,
  type PlanRouteRequest,
  type PreviewRouteOptionsRequest,
  type RouteOptionDto,
  type RoutePlanDto,
  type TripTrafficDto,
  type SpeedZoneDto,
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

/** M9 — unpersisted, lets a driver compare fastest/shortest before `planRoute` actually commits
 *  to one. */
export async function previewRouteOptions(
  accessToken: string,
  input: PreviewRouteOptionsRequest,
): Promise<RouteOptionDto[]> {
  const body = previewRouteOptionsRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/routing/route-options/preview', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return previewRouteOptionsResponseSchema.parse(json).options;
}

export async function getRoutePlan(accessToken: string, id: string): Promise<RoutePlanDto> {
  const { status, json } = await requestJson('GET', `/routing/route-plans/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return routePlanSchema.parse(json);
}

/** The speed limits to show along a planned route (fractions of the route, in order). */
export async function getRouteSpeedLimits(
  accessToken: string,
  routePlanId: string,
): Promise<SpeedZoneDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/routing/route-plans/${routePlanId}/speed-limits`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return routeSpeedLimitsSchema.parse(json).zones;
}

/** How much live traffic and other drivers' reports add to what is left of the route, from where the lorry is. */
export async function getTripTraffic(
  accessToken: string,
  tripId: string,
  position: { lat: number; lon: number },
): Promise<TripTrafficDto> {
  const { status, json } = await requestJson('POST', `/routing/trips/${tripId}/traffic`, {
    body: { position },
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tripTrafficSchema.parse(json);
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

/** `null` when nothing's in progress — never a 404, so no error handling needed here (design
 *  decision, 2026-09-24). Lets the app resume a trip the local, ephemeral trip store lost track
 *  of after a relaunch. */
export async function getActiveTrip(accessToken: string): Promise<ActiveTripDto | null> {
  const { status, json } = await requestJson('GET', '/routing/trips/active', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return findActiveTripResponseSchema.parse(json).trip;
}

/** While navigating: is there a clearly quicker route from here? `offer: null` is the ordinary answer, not an error. */
export async function checkFasterRoute(
  accessToken: string,
  tripId: string,
  input: FasterRouteCheckRequest,
): Promise<FasterRouteCheckResponse['offer']> {
  const body = fasterRouteCheckRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/routing/trips/${tripId}/faster-route`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return fasterRouteCheckResponseSchema.parse(json).offer;
}
