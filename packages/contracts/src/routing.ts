import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';

export const vehicleProfileIdSchema = brandedId<'VehicleProfileId'>();
export type VehicleProfileId = z.infer<typeof vehicleProfileIdSchema>;

export const routePlanIdSchema = brandedId<'RoutePlanId'>();
export type RoutePlanId = z.infer<typeof routePlanIdSchema>;

export const activeTripIdSchema = brandedId<'ActiveTripId'>();
export type ActiveTripId = z.infer<typeof activeTripIdSchema>;

export const geoPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
});
export type GeoPointDto = z.infer<typeof geoPointSchema>;

export const dimensionsSchema = z.object({
  heightM: z.number().positive(),
  widthM: z.number().positive(),
  lengthM: z.number().positive(),
  grossWeightT: z.number().positive(),
  axleWeightT: z.number().positive().optional(),
});
export type DimensionsDto = z.infer<typeof dimensionsSchema>;

export const vehicleProfileSchema = z.object({
  id: vehicleProfileIdSchema,
  driverId: driverIdSchema,
  name: z.string(),
  dimensions: dimensionsSchema,
});
export type VehicleProfileDto = z.infer<typeof vehicleProfileSchema>;

/** No `driverId` field (M4.2): the driver is whoever the caller's access token says they are,
 *  never a value the caller supplies — `interface/routes.ts` takes it from the verified token
 *  instead of parsing it out of this schema (decision 1). */
export const createVehicleProfileRequestSchema = z.object({
  name: z.string(),
  dimensions: dimensionsSchema,
});
export type CreateVehicleProfileRequest = z.infer<typeof createVehicleProfileRequestSchema>;

export const updateVehicleProfileRequestSchema = z.object({
  name: z.string(),
  dimensions: dimensionsSchema,
});
export type UpdateVehicleProfileRequest = z.infer<typeof updateVehicleProfileRequestSchema>;

/** The URL `:id` — a plain UUID on the wire, branded once it reaches core's domain (mirrors
 *  identity's revokeSessionParamsSchema). */
export const vehicleProfileIdParamsSchema = z.object({
  id: z.uuid(),
});
export type VehicleProfileIdParams = z.infer<typeof vehicleProfileIdParamsSchema>;

/** The shape of a domain error body every routing route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors identity's
 *  identityErrorResponseSchema. */
export const routingErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type RoutingErrorResponse = z.infer<typeof routingErrorResponseSchema>;

/** No `driverId` field, same reasoning as `createVehicleProfileRequestSchema` above. */
export const planRouteRequestSchema = z.object({
  profileId: vehicleProfileIdSchema,
  origin: geoPointSchema,
  destination: geoPointSchema,
});
export type PlanRouteRequest = z.infer<typeof planRouteRequestSchema>;

/** Always `[]` for now — see docs/progress.md's M2.5 deviations. The shape is here so nothing
 *  about the wire contract has to change once it's populated for real. */
export const avoidedRestrictionSchema = z.object({
  description: z.string(),
});
export type AvoidedRestrictionDto = z.infer<typeof avoidedRestrictionSchema>;

export const routePlanSchema = z.object({
  id: routePlanIdSchema,
  driverId: driverIdSchema,
  profileId: vehicleProfileIdSchema,
  origin: geoPointSchema,
  destination: geoPointSchema,
  geometry: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
  avoidedRestrictions: z.array(avoidedRestrictionSchema),
  hazardsOnRoute: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
export type RoutePlanDto = z.infer<typeof routePlanSchema>;

/** The URL `:id` for `POST /routing/route-plans/:id/trip` — mirrors
 *  `vehicleProfileIdParamsSchema`. */
export const routePlanIdParamsSchema = z.object({
  id: z.uuid(),
});
export type RoutePlanIdParams = z.infer<typeof routePlanIdParamsSchema>;

/** The URL `:id` for `POST /routing/trips/:id/end`. */
export const activeTripIdParamsSchema = z.object({
  id: z.uuid(),
});
export type ActiveTripIdParams = z.infer<typeof activeTripIdParamsSchema>;

/** `lastPosition`/`endedAt` are always absent for the whole of M5.6 (docs/progress.md) — the
 *  shape is here so nothing about the wire contract has to change once M6 populates them. */
export const activeTripSchema = z.object({
  id: activeTripIdSchema,
  routePlanId: routePlanIdSchema,
  driverId: driverIdSchema,
  startedAt: z.iso.datetime(),
  lastPosition: geoPointSchema.optional(),
  endedAt: z.iso.datetime().optional(),
});
export type ActiveTripDto = z.infer<typeof activeTripSchema>;
