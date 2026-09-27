import { err, ok, type Result } from '../../../shared/result.js';
import type { GeoPoint, GeoPolygon } from '../domain/geo.js';
import type {
  NoRouteFound,
  RouteRequest,
  RouteResult,
  RoutingEngine,
} from '../application/ports/routing-engine.js';

interface ValhallaLocation {
  readonly lat: number;
  readonly lon: number;
}

interface ValhallaTrip {
  readonly summary: { readonly time: number; readonly length: number };
  readonly legs: readonly { readonly shape: string }[];
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
 *  OpenStreetMap itself, out of scope for now. */
const TOP_SPEED_KPH = 88;

/** How many alternates to ask Valhalla for on top of its primary route (M9) — two is enough to
 *  give a driver a genuine second option without inflating Valhalla's own routing cost much. */
const ALTERNATES_REQUESTED = 2;

function toRouteResult(trip: ValhallaTrip): RouteResult {
  const leg = trip.legs[0];
  if (!leg) {
    throw new Error('Valhalla response had no legs');
  }
  return {
    geometry: leg.shape,
    distanceKm: trip.summary.length,
    durationMin: trip.summary.time / 60,
  };
}

/**
 * Truck-aware routing via a self-hosted Valhalla instance (design doc §4), behind the
 * `RoutingEngine` port. Talks to Valhalla's `/route` action directly over HTTP — no client
 * library; the request/response shape is small enough that hand-rolling it (decision 6's "hand-
 * roll small, well-understood things") beats a dependency for a handful of fields.
 */
export class ValhallaRoutingEngine implements RoutingEngine {
  constructor(private readonly baseUrl: string) {}

  private requestBody(req: RouteRequest, alternates: number | undefined): Record<string, unknown> {
    return {
      locations: [toValhallaLocation(req.origin), toValhallaLocation(req.destination)],
      costing: 'truck',
      costing_options: {
        truck: {
          height: req.dimensions.heightM,
          width: req.dimensions.widthM,
          length: req.dimensions.lengthM,
          weight: req.dimensions.grossWeightT,
          top_speed: TOP_SPEED_KPH,
          ...(req.dimensions.axleWeightT === undefined
            ? {}
            : { axle_load: req.dimensions.axleWeightT }),
        },
      },
      ...(req.avoid.length === 0 ? {} : { exclude_polygons: req.avoid.map(toValhallaPolygon) }),
      ...(alternates === undefined ? {} : { alternates }),
    };
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

  async route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    const result = await this.post(this.requestBody(req, undefined));
    if (!result.ok) {
      return result;
    }
    return ok(toRouteResult(result.value.trip));
  }

  async routeAlternatives(
    req: RouteRequest,
  ): Promise<Result<readonly RouteResult[], NoRouteFound>> {
    const result = await this.post(this.requestBody(req, ALTERNATES_REQUESTED));
    if (!result.ok) {
      return result;
    }
    const alternateTrips = result.value.alternates?.map((a) => a.trip) ?? [];
    return ok([result.value.trip, ...alternateTrips].map(toRouteResult));
  }
}
