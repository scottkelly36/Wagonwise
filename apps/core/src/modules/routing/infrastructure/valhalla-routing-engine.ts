import { err, ok, type Result } from '../../../shared/result.js';
import { decodePolyline, type GeoPoint, type GeoPolygon } from '../domain/geo.js';
import type { ElevationPoint } from '../domain/hill-profile.js';
import type { Maneuver, ManeuverKind } from '../domain/maneuver.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from '../application/ports/routing-engine.js';

interface ValhallaLocation {
  readonly lat: number;
  readonly lon: number;
  readonly heading?: number;
  readonly heading_tolerance?: number;
}

/** How far from the vehicle's heading the first road may point, in degrees. Valhalla's own default. */
const HEADING_TOLERANCE_DEG = 60;

/** One step in a leg's turn list. Only the fields we use; `length` is in the request's units
 *  (kilometres, which `directionsOptions` pins). */
interface ValhallaManeuver {
  readonly type: number;
  readonly instruction?: string;
  readonly verbal_pre_transition_instruction?: string;
  readonly street_names?: readonly string[];
  readonly length: number;
  readonly begin_shape_index: number;
  readonly end_shape_index?: number;
  readonly roundabout_exit_count?: number;
  /** The step is on a toll road, bridge or tunnel, as the map data has it. */
  readonly toll?: boolean;
}

interface ValhallaTrip {
  readonly summary: { readonly time: number; readonly length: number; readonly has_toll?: boolean };
  readonly legs: readonly {
    readonly shape: string;
    readonly maneuvers?: readonly ValhallaManeuver[];
  }[];
}

interface ValhallaSuccessResponse {
  readonly trip: ValhallaTrip;
  /** Present only when the request carried `alternates` and Valhalla found any — a sibling array
   *  of `{ trip }` wrappers, not part of `trip` itself. May be shorter than requested, or absent
   *  entirely: alternate-route diversity isn't guaranteed with `truck` costing plus
   *  `exclude_polygons` (Valhalla's own documented caveat). */
  readonly alternates?: readonly { readonly trip: ValhallaTrip }[];
}

interface ValhallaErrorResponse {
  readonly error_code: number;
  readonly error: string;
}

function isValhallaError(body: unknown): body is ValhallaErrorResponse {
  return typeof body === 'object' && body !== null && 'error_code' in body;
}

function toValhallaLocation(point: GeoPoint): ValhallaLocation {
  return { lat: point.lat, lon: point.lon };
}

/** Valhalla wants each ring closed (first point repeated at the end) — a Valhalla-specific
 *  requirement, so it's handled here rather than forcing every caller of the domain's
 *  `GeoPolygon` to remember to repeat a point. */
function toValhallaPolygon(polygon: GeoPolygon): [number, number][] {
  const ring = polygon.points.map((p): [number, number] => [p.lon, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push(first);
  }
  return ring;
}

/** 55mph in km/h, Valhalla's own unit for `top_speed` regardless of the request's `units` field
 *  — a flat ceiling roughly midway between a UK HGV's legal 60mph on a motorway/dual carriageway
 *  and 50mph on a single carriageway (2026-09-26). Valhalla only ever prefers a road's own
 *  `maxspeed:hgv` OSM tag over this when that tag exists on a given way; most roads in our
 *  current coverage don't have one, so without this cap a truck was timed as if it could travel
 *  at a car's full posted speed limit everywhere. Imperfect in both directions (still overstates
 *  a single carriageway, understates a motorway) — the real fix is `maxspeed:hgv` tagging in
 *  OpenStreetMap itself, out of scope for now.
 *
 *  **Used for timing only, never for choosing the route** (2026-10-03). Sent to `/route`, the cap
 *  flattens the speed difference between roads, so a faster A-road loses its advantage and the
 *  engine picks a shorter back road: Hexham to Heddon-on-the-Wall went A68 + the Military Road
 *  (B6318) instead of the A69, and the A69 route was in fact quicker even when timed with the same
 *  cap. So the route is chosen without it and then timed along that exact road by `retime`.
 *
 *  This is the speed when a vehicle has none of its own: a vehicle's `topSpeedKph` (a limiter, or how its driver drives it) takes
 *  its place for the timing, and still never for choosing the road. */
const TOP_SPEED_KPH = 88;

/** Used when a route can't be re-timed (Valhalla refuses the trace, e.g. a shape longer than its
 *  point limit): the uncapped time scaled by roughly what the cap added on the Northumberland test
 *  routes (1.16 to 1.17, 2026-10-03). Better to be a little pessimistic than to show a truck
 *  moving at car speeds. */
export const FALLBACK_TIME_FACTOR = 1.17;

/** Turn-by-turn wording for spoken directions (P2-M10): British English, and kilometres so each
 *  step's `length` matches `summary.length`. Distances are spoken by the app (yards and miles,
 *  as on UK road signs), not taken from the engine, which says "feet". */
const DIRECTIONS_OPTIONS = { units: 'kilometers', language: 'en-GB' } as const;

/** Heights are asked for about this often along a route. Finer is only noise: the data is in 90 m cells. */
const HEIGHT_RESAMPLE_M = 100;

/** A route's line is thinned to about this many points before heights are asked for, so a route across Britain stays under the
 *  service's limit on the length of a shape (`service_limits.height.max_shape`, 100,000 by default). */
const MAX_HEIGHT_SHAPE_POINTS = 20_000;

/** The height service is an extra: it never holds up a route for longer than this. */
const HEIGHT_TIMEOUT_MS = 20_000;

/** How many alternates to ask Valhalla for on top of its primary route (M9) — two is enough to
 *  give a driver a genuine second option without inflating Valhalla's own routing cost much. */
const ALTERNATES_REQUESTED = 2;

/** Valhalla's numeric turn types (its documented `maneuver.type` table) as our own kinds. Anything not
 *  listed (becomes, continue, a straight ramp, transit) is just "keep going". */
const MANEUVER_KINDS: Readonly<Record<number, ManeuverKind>> = {
  1: 'depart',
  2: 'depart',
  3: 'depart',
  4: 'arrive',
  5: 'arrive',
  6: 'arrive',
  9: 'slight_right',
  10: 'right',
  11: 'sharp_right',
  12: 'u_turn',
  13: 'u_turn',
  14: 'sharp_left',
  15: 'left',
  16: 'slight_left',
  18: 'exit_right',
  19: 'exit_left',
  20: 'exit_right',
  21: 'exit_left',
  23: 'keep_right',
  24: 'keep_left',
  25: 'merge',
  26: 'roundabout',
  27: 'roundabout_exit',
  28: 'ferry',
  29: 'ferry',
  37: 'merge',
  38: 'merge',
};

const METRES_PER_KM = 1000;

export function toManeuver(m: ValhallaManeuver): Maneuver {
  const text = m.instruction ?? '';
  return {
    kind: MANEUVER_KINDS[m.type] ?? 'straight',
    text,
    // Falls back to the display text: both are plain sentences, the spoken one just reads better.
    speech: m.verbal_pre_transition_instruction ?? text,
    streetNames: m.street_names ?? [],
    lengthM: Math.round(m.length * METRES_PER_KM),
    beginShapeIndex: m.begin_shape_index,
    ...(m.roundabout_exit_count === undefined ? {} : { roundaboutExit: m.roundabout_exit_count }),
  };
}

/** A route's tolled stretches are kept as about this many points in all: enough to say which crossing, few enough to carry about. */
const MAX_TOLL_POINTS = 60;

/**
 * Points on the stretches of a route the engine says are tolled: the points of each tolled step's part of the route, thinned evenly to at most
 * `MAX_TOLL_POINTS`. Empty when no step is tolled. Used to name the crossing, so exact spacing does not matter.
 */
export function tollPointsOf(
  shape: string,
  maneuvers: readonly ValhallaManeuver[],
): readonly GeoPoint[] {
  const tolled = maneuvers.filter((m) => m.toll === true);
  if (tolled.length === 0) return [];
  const line = decodePolyline(shape);
  const points = tolled.flatMap((m) =>
    line.slice(m.begin_shape_index, (m.end_shape_index ?? m.begin_shape_index) + 1),
  );
  const step = Math.max(1, Math.ceil(points.length / MAX_TOLL_POINTS));
  return points.filter((_, index) => index % step === 0);
}

function toRouteResult(trip: ValhallaTrip): RouteResult {
  const leg = trip.legs[0];
  if (!leg) {
    throw new Error('Valhalla response had no legs');
  }
  const tollPoints = tollPointsOf(leg.shape, leg.maneuvers ?? []);
  return {
    geometry: leg.shape,
    distanceKm: trip.summary.length,
    durationMin: trip.summary.time / 60,
    maneuvers: (leg.maneuvers ?? []).map(toManeuver),
    ...(typeof trip.summary.has_toll === 'boolean' ? { hasToll: trip.summary.has_toll } : {}),
    ...(tollPoints.length === 0 ? {} : { tollPoints }),
  };
}

/** Valhalla's truck costing options for a vehicle. `topSpeedKph` is for timing only: see
 *  `TOP_SPEED_KPH`. */
function truckCosting(
  dimensions: Dimensions,
  topSpeedKph?: number,
  avoidTolls?: boolean,
): Record<string, unknown> {
  return {
    costing: 'truck',
    costing_options: {
      truck: {
        height: dimensions.heightM,
        width: dimensions.widthM,
        length: dimensions.lengthM,
        weight: dimensions.grossWeightT,
        ...(dimensions.axleWeightT === undefined ? {} : { axle_load: dimensions.axleWeightT }),
        ...(topSpeedKph === undefined ? {} : { top_speed: topSpeedKph }),
        // 0 is the most reluctant Valhalla goes: it still uses a toll when there is no other way.
        ...(avoidTolls === true ? { use_tolls: 0 } : {}),
      },
    },
  };
}

/**
 * Truck-aware routing via a self-hosted Valhalla instance (design doc §4), behind the
 * `RoutingEngine` port. Talks to Valhalla's `/route` action directly over HTTP — no client
 * library; the request/response shape is small enough that hand-rolling it (decision 6's "hand-
 * roll small, well-understood things") beats a dependency for a handful of fields.
 *
 * Two steps per route: `/route` chooses the road (no speed cap, so a faster A-road keeps its
 * advantage), then `/trace_route` walks that exact road with the 55mph cap to get a realistic
 * time. See `TOP_SPEED_KPH`.
 */
export class ValhallaRoutingEngine implements RoutingEngine {
  constructor(private readonly baseUrl: string) {}

  private requestBody(req: RouteRequest, alternates: number | undefined): Record<string, unknown> {
    return {
      locations: [
        req.originHeadingDeg === undefined
          ? toValhallaLocation(req.origin)
          : {
              ...toValhallaLocation(req.origin),
              heading: Math.round(req.originHeadingDeg) % 360,
              heading_tolerance: HEADING_TOLERANCE_DEG,
            },
        toValhallaLocation(req.destination),
      ],
      ...truckCosting(req.dimensions, undefined, req.avoidTolls),
      ...(req.avoid.length === 0 ? {} : { exclude_polygons: req.avoid.map(toValhallaPolygon) }),
      ...(alternates === undefined ? {} : { alternates }),
      directions_options: DIRECTIONS_OPTIONS,
    };
  }

  /** Asks for the route; if one was asked for with a heading and none exists that sets off that way,
   *  asks again without it, so a heading can only ever improve a route, never cause "no route". */
  private async postRoute(
    req: RouteRequest,
    alternates: number | undefined,
  ): Promise<Result<ValhallaSuccessResponse, NoRouteFound>> {
    const result = await this.post(this.requestBody(req, alternates));
    if (result.ok || req.originHeadingDeg === undefined) return result;
    return this.post(this.requestBody({ ...req, originHeadingDeg: undefined }, alternates));
  }

  private async post(
    body: Record<string, unknown>,
  ): Promise<Result<ValhallaSuccessResponse, NoRouteFound>> {
    const response = await fetch(`${this.baseUrl}/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed: unknown = await response.json();

    if (!response.ok) {
      if (isValhallaError(parsed)) {
        return err({ tag: 'NoRouteFound' });
      }
      throw new Error(
        `Valhalla returned ${response.status} with an unrecognised body: ${JSON.stringify(parsed)}`,
      );
    }
    return ok(parsed as ValhallaSuccessResponse);
  }

  /** The time, in seconds, to drive `trip`'s exact road at the HGV speed cap. Falls back to the
   *  uncapped time scaled by `FALLBACK_TIME_FACTOR` if Valhalla can't walk the shape — a failure to
   *  re-time never fails the route itself. */
  private async retime(trip: ValhallaTrip, dimensions: Dimensions): Promise<number> {
    const shape = trip.legs[0]?.shape;
    const fallback = trip.summary.time * FALLBACK_TIME_FACTOR;
    if (shape === undefined) return fallback;
    try {
      const response = await fetch(`${this.baseUrl}/trace_route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: decodePolyline(shape).map(toValhallaLocation),
          shape_match: 'edge_walk',
          ...truckCosting(dimensions, dimensions.topSpeedKph ?? TOP_SPEED_KPH),
        }),
      });
      if (!response.ok) return fallback;
      const parsed = (await response.json()) as { trip?: { summary?: { time?: unknown } } };
      const time = parsed.trip?.summary?.time;
      return typeof time === 'number' && time > 0 ? time : fallback;
    } catch {
      return fallback;
    }
  }

  private async toRouteResult(trip: ValhallaTrip, dimensions: Dimensions): Promise<RouteResult> {
    const result = toRouteResult(trip);
    return { ...result, durationMin: (await this.retime(trip, dimensions)) / 60 };
  }

  async route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    const result = await this.postRoute(req, undefined);
    if (!result.ok) {
      return result;
    }
    return ok(await this.toRouteResult(result.value.trip, req.dimensions));
  }

  /**
   * Valhalla's `/height` on the route's own line, resampled every {@link HEIGHT_RESAMPLE_M}. It reads the elevation files in the folder
   * `valhalla.json` names, independently of the road tiles, so it works once those are in place and answers an error before. Any failure
   * is `undefined` ("no heights"), never a thrown error: hills must not stop a route.
   */
  async elevationProfile(geometry: string): Promise<readonly ElevationPoint[] | undefined> {
    const all = decodePolyline(geometry);
    if (all.length < 2) return undefined;
    const step = Math.ceil(all.length / MAX_HEIGHT_SHAPE_POINTS);
    const shape = all.filter((_, i) => i % step === 0 || i === all.length - 1);
    try {
      const response = await fetch(`${this.baseUrl}/height`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: shape.map((p) => ({ lat: p.lat, lon: p.lon })),
          range: true,
          resample_distance: HEIGHT_RESAMPLE_M,
        }),
        signal: AbortSignal.timeout(HEIGHT_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { range_height?: unknown };
      if (!Array.isArray(body.range_height)) return undefined;
      const points: ElevationPoint[] = [];
      for (const pair of body.range_height as unknown[]) {
        // A pair is [distance, height]; a cell with no data has a null or missing height and is left out.
        if (!Array.isArray(pair)) continue;
        const [distanceM, heightM] = pair as unknown[];
        if (typeof distanceM === 'number' && typeof heightM === 'number') {
          points.push({ distanceM, heightM });
        }
      }
      return points.length >= 2 ? points : undefined;
    } catch {
      return undefined;
    }
  }

  async routeAlternatives(
    req: RouteRequest,
  ): Promise<Result<readonly RouteResult[], NoRouteFound>> {
    const result = await this.postRoute(req, ALTERNATES_REQUESTED);
    if (!result.ok) {
      return result;
    }
    const alternateTrips = result.value.alternates?.map((a) => a.trip) ?? [];
    const trips = [result.value.trip, ...alternateTrips];
    return ok(await Promise.all(trips.map((trip) => this.toRouteResult(trip, req.dimensions))));
  }
}
