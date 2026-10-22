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
  /** Which way the vehicle is heading, degrees clockwise from north, when it is already moving. The
   *  route then starts in that direction rather than asking for a U-turn (re-planning mid-drive). */
  originHeadingDeg: z.number().min(0).max(360).optional(),
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

/** What kind of turn a step is, for the arrow and the wording (P2-M10). Our own list, not the routing
 *  engine's numbering. */
export const maneuverKindSchema = z.enum([
  'depart',
  'arrive',
  'straight',
  'slight_left',
  'left',
  'sharp_left',
  'slight_right',
  'right',
  'sharp_right',
  'u_turn',
  'keep_left',
  'keep_right',
  'exit_left',
  'exit_right',
  'merge',
  'roundabout',
  'roundabout_exit',
  'ferry',
]);
export type ManeuverKindDto = z.infer<typeof maneuverKindSchema>;

/** One step of turn-by-turn guidance along a route's geometry. */
export const maneuverSchema = z.object({
  kind: maneuverKindSchema,
  /** To show: "Turn left onto Hencotes (B6305)." */
  text: z.string(),
  /** To say, without a distance (the app adds "In 300 yards,"). */
  speech: z.string(),
  streetNames: z.array(z.string()),
  /** Metres from this step to the next. */
  lengthM: z.number().nonnegative(),
  /** Index of the point in the decoded route geometry where this step begins. */
  beginShapeIndex: z.number().int().nonnegative(),
  roundaboutExit: z.number().int().positive().optional(),
});
export type ManeuverDto = z.infer<typeof maneuverSchema>;

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
  /** Empty for a plan made before spoken directions existed, so such a plan stays silent. */
  maneuvers: z.array(maneuverSchema).default([]),
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

/**
 * `GET /routing/route-plans/:id/speed-limits`: what to show a driver about the speed limit along a route. `from` and
 * `to` are fractions of the route's length (0 to 1). A zone without `limitMph` is the national speed limit. Stretches
 * with no zone have nothing to show: the limit is not known, and nothing is guessed.
 */
export const speedZoneSchema = z.object({
  from: z.number().min(0).max(1),
  to: z.number().min(0).max(1),
  limitMph: z.number().int().positive().optional(),
});
export type SpeedZoneDto = z.infer<typeof speedZoneSchema>;

export const routeSpeedLimitsSchema = z.object({ zones: z.array(speedZoneSchema) });
export type RouteSpeedLimitsDto = z.infer<typeof routeSpeedLimitsSchema>;

/** `POST /routing/trips/:id/traffic`: how much live traffic and other drivers' reports add to what is left of the route. */
export const tripTrafficRequestSchema = z.object({ position: geoPointSchema });
export type TripTrafficRequest = z.infer<typeof tripTrafficRequestSchema>;

export const tripTrafficSchema = z.object({
  /** Whether live traffic is switched on at all. */
  enabled: z.boolean(),
  /** Minutes added to the rest of the route over its clear-road time. */
  extraMinutes: z.number().int().min(0),
  /** Share (0 to 1) of the rest of the route the provider had a reading for; below that the delay is a lower bound. */
  coverage: z.number().min(0).max(1),
  /** Where on the whole route traffic is held up, as fractions of its length, ahead of the lorry. About 5 km fine, not exact. */
  stretches: z
    .array(
      z.object({
        from: z.number().min(0).max(1),
        to: z.number().min(0).max(1),
        level: z.enum(['slow', 'heavy']),
      }),
    )
    .default([]),
});
export type TripTrafficDto = z.infer<typeof tripTrafficSchema>;
/**
 * `GET /routing/route-plans/:id/cameras`: speed and red-light cameras on a route, from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL). Mobile cameras are not in the map data and the map is not complete, so a camera warning is a courtesy
 * and not a promise.
 */
export const routeCameraSchema = z.object({
  id: z.string(),
  location: geoPointSchema,
  kind: z.enum(['fixed', 'average', 'red_light']),
  /** The limit the map gives for the camera, in mph, when it says one. */
  maxspeedMph: z.number().int().positive().optional(),
});
export type RouteCameraDto = z.infer<typeof routeCameraSchema>;

export const routeCamerasSchema = z.object({ cameras: z.array(routeCameraSchema) });
export type RouteCamerasDto = z.infer<typeof routeCamerasSchema>;

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

/** `POST /routing/trips/:id/faster-route`: the app asks, while navigating, whether a clearly quicker route
 *  exists. Core does not track the lorry, so the app sends where it is. `keptKeys` are offers the driver has
 *  already declined on this trip (the `key` of each earlier offer), which are never offered again. */
export const fasterRouteCheckRequestSchema = z.object({
  position: geoPointSchema,
  headingDeg: z.number().min(0).max(360).optional(),
  keptKeys: z.array(z.string().max(32)).max(20).default([]),
});
export type FasterRouteCheckRequest = z.infer<typeof fasterRouteCheckRequestSchema>;

/** `offer: null` is the ordinary "nothing worth saying" answer, so this is always a 200. The offered route is a
 *  saved plan from the driver's position, shown and switched to the way a reroute alert's plan is. */
export const fasterRouteCheckResponseSchema = z.object({
  offer: z
    .object({
      routePlanId: routePlanIdSchema,
      key: z.string(),
      savingMinutes: z.number().int(),
      /** Minutes left on each route, counting traffic and drivers' congestion reports. */
      currentMinutes: z.number().int(),
      alternativeMinutes: z.number().int(),
    })
    .nullable(),
});
export type FasterRouteCheckResponse = z.infer<typeof fasterRouteCheckResponseSchema>;
