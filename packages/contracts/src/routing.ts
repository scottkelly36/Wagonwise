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

// Sibling to `dimensions`, not part of it (M9, docs/progress.md) — this never reaches Valhalla's
// truck costing, it only feeds a rough fuel-cost estimate for route options.
const fuelConsumptionL100kmSchema = z.number().positive().optional();

export const vehicleProfileSchema = z.object({
  id: vehicleProfileIdSchema,
  driverId: driverIdSchema,
  name: z.string(),
  dimensions: dimensionsSchema,
  fuelConsumptionL100km: fuelConsumptionL100kmSchema,
});
export type VehicleProfileDto = z.infer<typeof vehicleProfileSchema>;

/** No `driverId` field (M4.2): the driver is whoever the caller's access token says they are,
 *  never a value the caller supplies — `interface/routes.ts` takes it from the verified token
 *  instead of parsing it out of this schema (decision 1). */
export const createVehicleProfileRequestSchema = z.object({
  name: z.string(),
  dimensions: dimensionsSchema,
  fuelConsumptionL100km: fuelConsumptionL100kmSchema,
});
export type CreateVehicleProfileRequest = z.infer<typeof createVehicleProfileRequestSchema>;

export const updateVehicleProfileRequestSchema = z.object({
  name: z.string(),
  dimensions: dimensionsSchema,
  fuelConsumptionL100km: fuelConsumptionL100kmSchema,
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

/** No `driverId` field, same reasoning as `createVehicleProfileRequestSchema` above.
 *  `strategy` (M9, docs/progress.md) is optional — omitted (or `'fastest'`) means today's only
 *  behaviour, the engine's primary route; `'shortest'` picks the shortest of the engine's
 *  alternates instead. Usually set from whichever option a driver picked after previewing via
 *  `POST /routing/route-options/preview`. */
export const planRouteRequestSchema = z.object({
  profileId: vehicleProfileIdSchema,
  origin: geoPointSchema,
  destination: geoPointSchema,
  strategy: z.enum(['fastest', 'shortest']).optional(),
});
export type PlanRouteRequest = z.infer<typeof planRouteRequestSchema>;

/** Same request shape as planning, minus `strategy` — previewing is how a driver decides what
 *  `strategy` to send in the first place. */
export const previewRouteOptionsRequestSchema = z.object({
  profileId: vehicleProfileIdSchema,
  origin: geoPointSchema,
  destination: geoPointSchema,
});
export type PreviewRouteOptionsRequest = z.infer<typeof previewRouteOptionsRequestSchema>;

/** `labels` is non-empty — a route that's both the fastest and the shortest of the candidates
 *  carries both labels rather than being split into two identical-looking cards. */
export const routeOptionSchema = z.object({
  geometry: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
  estimatedFuelCostGBP: z.number().optional(),
  labels: z.array(z.enum(['fastest', 'shortest'])).min(1),
});
export type RouteOptionDto = z.infer<typeof routeOptionSchema>;

export const previewRouteOptionsResponseSchema = z.object({
  options: z.array(routeOptionSchema),
});
export type PreviewRouteOptionsResponse = z.infer<typeof previewRouteOptionsResponseSchema>;

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
  estimatedFuelCostGBP: z.number().optional(),
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

/** `GET /routing/trips/active` — `trip: null` is the ordinary "nothing in progress" case, not an
 *  error, so this is always a 200 rather than a 404 (design decision, 2026-09-24: the driver app
 *  polls this on launch to resume an in-progress trip the local, ephemeral trip store lost track
 *  of after a relaunch — see M5.6's deviations log). */
export const findActiveTripResponseSchema = z.object({
  trip: activeTripSchema.nullable(),
});
export type FindActiveTripResponse = z.infer<typeof findActiveTripResponseSchema>;
