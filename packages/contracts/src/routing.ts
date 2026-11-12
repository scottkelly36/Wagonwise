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
  /** The speed the vehicle is timed at, in km/h (a limiter, or how the driver drives it). Blank means the usual 55 mph. It only changes the
   *  time a route takes, never which road is chosen. 30 to 130 km/h is 19 to 81 mph, which takes in a limited lorry and a van. */
  topSpeedKph: z.number().min(30).max(130).optional(),
  /** Whether the vehicle meets the Euro VI emissions standard, which the low emission and clean air zones for a lorry ask about. Absent means not stated
   *  (the driver or firm does not know), and is never read as compliant. */
  euroVI: z.boolean().optional(),
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
  /** `gentle` is the route the preview marked as easier on a loaded vehicle (fewest steep hills); `toll-free` the one marked as avoiding tolls. */
  strategy: z.enum(['fastest', 'shortest', 'gentle', 'toll-free']).optional(),
  /** Which way the vehicle is heading, degrees clockwise from north, when it is already moving. The
   *  route then starts in that direction rather than asking for a U-turn (re-planning mid-drive). */
  originHeadingDeg: z.number().min(0).max(360).optional(),
  /** The driver has been told no route exists for the vehicle's weight and chose one past a weight limit anyway (shown by
   *  `breaksWeightLimit` on a previewed option). Without it only a route for the real weight is made. */
  acceptWeightLimit: z.boolean().optional(),
  /** Keep avoiding tolls, on any strategy: set on a re-plan from the middle of a drive whose route was chosen for having no toll. A preference, not a ban. */
  avoidTolls: z.boolean().optional(),
});
export type PlanRouteRequest = z.infer<typeof planRouteRequestSchema>;

/** Same request shape as planning, minus `strategy` — previewing is how a driver decides what
 *  `strategy` to send in the first place. */
export const previewRouteOptionsRequestSchema = z.object({
  profileId: vehicleProfileIdSchema,
  origin: geoPointSchema,
  destination: geoPointSchema,
  /** The app can show an English zone's daily charge as well as a Scottish penalty (and London's). Without it only the Scottish zones are reported, in the old shape. */
  dailyZones: z.boolean().optional(),
  /** The app can show what each route costs and a Cheapest label. Without it the options carry neither (an older app cannot read the new label). */
  costs: z.boolean().optional(),
  /** The vehicle is loaded: check the hills on each route and mark the gentlest. Without it the options are as before. */
  loaded: z.boolean().optional(),
  /** The app can show tolls: routes say whether they have one, and when one does a `toll-free` option is looked for. An older app does not send this and
   *  gets the options as before, since it could not read the new label. */
  tolls: z.boolean().optional(),
});
export type PreviewRouteOptionsRequest = z.infer<typeof previewRouteOptionsRequestSchema>;

/** How hilly a route is: what the hill check found. Steep is a grade of 6% or more over 500 m, climbing or descending. */
export const hillSummarySchema = z.object({
  climbM: z.number(),
  highestPointM: z.number(),
  steepestPct: z.number(),
  steepKm: z.number(),
  steepStretches: z.number().int(),
});
export type HillSummaryDto = z.infer<typeof hillSummarySchema>;

/** What a route costs to drive, in pounds. `totalGBP` is absent without a fuel figure; `unpriced` is true when a toll on the route has no price, so the figures are a floor. */
export const routeCostSchema = z.object({
  fuelGBP: z.number().optional(),
  chargesGBP: z.number(),
  totalGBP: z.number().optional(),
  unpriced: z.boolean().optional(),
});
export type RouteCostDto = z.infer<typeof routeCostSchema>;

/** A named toll on a route and what it charges this vehicle. `lowGBP` and `highGBP` are both absent when there is no price for the vehicle (a class that
 *  was not read); they differ when the vehicle's axles could put it in more than one class. */
export const routeChargeSchema = z.object({
  name: z.string(),
  lowGBP: z.number().optional(),
  highGBP: z.number().optional(),
  /** What the price is, when it is not simply the price of a crossing ("the full length"). */
  note: z.string().optional(),
  /** When to pay, only when the operator said. */
  payBy: z.string().optional(),
});
export type RouteChargeDto = z.infer<typeof routeChargeSchema>;

/** A low emission zone and its outline, for the dispatcher's live map. `rings` are the pieces of the zone, each a closed outline of `[latitude, longitude]` pairs. */
export const lowEmissionZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What a vehicle that does not meet the standard pays: `penalty` is a Scottish zone's penalty notice (the first is `penaltyGBP`, doubling within 90 days), `daily` an English zone's daily charge. */
  kind: z.enum(['penalty', 'daily']),
  penaltyGBP: z.number().optional(),
  dailyChargeGBP: z.object({ lowGBP: z.number(), highGBP: z.number() }).optional(),
  /** The day enforcement began (YYYY-MM-DD). */
  enforcedFrom: z.string(),
  rings: z.array(z.array(z.tuple([z.number(), z.number()]))),
});
export type LowEmissionZoneDto = z.infer<typeof lowEmissionZoneSchema>;

/** `GET /staff/routing/low-emission-zones`: the zones to draw, and the credit the licence asks for beside them. */
export const lowEmissionZonesResponseSchema = z.object({
  zones: z.array(lowEmissionZoneSchema),
  attribution: z.string(),
});
export type LowEmissionZonesResponse = z.infer<typeof lowEmissionZonesResponseSchema>;

/** A low emission zone the route enters that could cost this vehicle. `charged`: the vehicle has been said not to meet the standard, so a penalty applies.
 *  `may-be-charged`: it has not been said either way, which is never read as fine. A vehicle that meets Euro VI gets no entry. */
export const routeZoneSchema = z.object({
  name: z.string(),
  status: z.enum(['charged', 'may-be-charged']),
  /** Absent means a penalty zone (older servers sent only those). `daily` is an English zone's daily charge. */
  kind: z.enum(['penalty', 'daily']).optional(),
  /** The penalty for a first breach, in pounds; it doubles for each further one within 90 days. Present for a penalty zone. */
  penaltyGBP: z.number().optional(),
  /** The daily charge for a lorry, in pounds; the two differ when it depends on something the vehicle's details do not say. Present for a daily zone. */
  dailyChargeGBP: z.object({ lowGBP: z.number(), highGBP: z.number() }).optional(),
});
export type RouteZoneDto = z.infer<typeof routeZoneSchema>;

/** `labels` is non-empty — a route that's both the fastest and the shortest of the candidates
 *  carries both labels rather than being split into two identical-looking cards. */
export const routeOptionSchema = z.object({
  geometry: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
  estimatedFuelCostGBP: z.number().optional(),
  labels: z.array(z.enum(['fastest', 'shortest', 'gentle', 'toll-free', 'cheapest'])).min(1),
  /** The route has a toll, as far as the map data says. Present only when the engine said either way. */
  hasToll: z.boolean().optional(),
  /** What the route costs to drive: fuel, tolls and zone charges (the highest the tables say). Present only when the app asked for costs (`costs`). */
  cost: routeCostSchema.optional(),
  /** The named tolls on the route and their prices. Present only when the app asked about tolls (`tolls`) and the route passes one we know. */
  charges: z.array(routeChargeSchema).optional(),
  /** The low emission zones the route enters that could cost this vehicle. Absent when there are none, including for a vehicle that meets Euro VI. */
  zones: z.array(routeZoneSchema).optional(),
  /** Present only when `loaded` was asked for and the server has height data. */
  hills: hillSummarySchema.optional(),
  /** Present and true when no route exists for the vehicle's weight and this one goes past a weight limit. */
  breaksWeightLimit: z.boolean().optional(),
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
  /** Present and true when the driver chose a route past a weight limit because none existed for the vehicle's weight. */
  breaksWeightLimit: z.boolean().optional(),
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

/** Where the route runs over a bridge, as the points where each starts and ends. A low-bridge restriction is on the road underneath, so such a hazard
 *  on one of these stretches is not the driver's. */
export const bridgeStretchSchema = z.object({ from: geoPointSchema, to: geoPointSchema });
export type BridgeStretchDto = z.infer<typeof bridgeStretchSchema>;

export const routeSpeedLimitsSchema = z.object({
  zones: z.array(speedZoneSchema),
  bridges: z.array(bridgeStretchSchema).default([]),
  /** The OpenStreetMap ways the route runs along. A hazard mapped on a way that is not among them is on another road, one that
   *  crosses or joins the route, so is not the driver's. Empty when they could not be read: then nothing is ruled out. */
  wayIds: z.array(z.number().int().positive()).default([]),
});
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

/**
 * `POST /routing/trips/:id/end`. The body is optional: an app that ended the trip with no signal says when the driver tapped, so the trip is not recorded as
 * ending whenever the signal came back. The server keeps it between the trip's start and now, and a trip already ended keeps the end it has.
 */
export const endTripRequestSchema = z.object({ endedAt: z.iso.datetime().optional() });
export type EndTripRequest = z.infer<typeof endTripRequestSchema>;

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
  /** The vehicle is loaded: a route that adds steep hills is not offered as the faster one. Only has an effect when the server has height data. */
  loaded: z.boolean().optional(),
  /** The driver chose this route for having no toll: ask for alternatives that avoid tolls, and never offer one that has a toll. */
  avoidTolls: z.boolean().optional(),
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
      /** The offered route has a toll (as the map data says), so the card can say so. Absent when it has none. */
      hasToll: z.boolean().optional(),
    })
    .nullable(),
});
export type FasterRouteCheckResponse = z.infer<typeof fasterRouteCheckResponseSchema>;
