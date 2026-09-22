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

interface ValhallaSuccessResponse {
  readonly trip: {
    readonly summary: { readonly time: number; readonly length: number };
    readonly legs: readonly { readonly shape: string }[];
  };
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

/**
 * Truck-aware routing via a self-hosted Valhalla instance (design doc §4), behind the
 * `RoutingEngine` port. Talks to Valhalla's `/route` action directly over HTTP — no client
 * library; the request/response shape is small enough that hand-rolling it (decision 6's "hand-
 * roll small, well-understood things") beats a dependency for a handful of fields.
 */
export class ValhallaRoutingEngine implements RoutingEngine {
  constructor(private readonly baseUrl: string) {}

  async route(req: RouteRequest): Promise<Result<RouteResult, NoRouteFound>> {
    const body = {
      locations: [toValhallaLocation(req.origin), toValhallaLocation(req.destination)],
      costing: 'truck',
      costing_options: {
        truck: {
          height: req.dimensions.heightM,
          width: req.dimensions.widthM,
          length: req.dimensions.lengthM,
          weight: req.dimensions.grossWeightT,
          ...(req.dimensions.axleWeightT === undefined
            ? {}
            : { axle_load: req.dimensions.axleWeightT }),
        },
      },
      ...(req.avoid.length === 0 ? {} : { exclude_polygons: req.avoid.map(toValhallaPolygon) }),
    };

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

    const success = parsed as ValhallaSuccessResponse;
    const leg = success.trip.legs[0];
    if (!leg) {
      throw new Error('Valhalla response had no legs');
    }
    return ok({
      geometry: leg.shape,
      distanceKm: success.trip.summary.length,
      durationMin: success.trip.summary.time / 60,
    });
  }
}
