export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/**
 * An encoded polyline string (design doc §3: `geometry: GeoLine // encoded polyline`).
 * Specifically polyline6 (1e6 precision) — Valhalla's own default route-geometry encoding
 * (confirmed against a real response in M2.1) — so `RouteResult.geometry` from the Valhalla
 * adapter can be a direct passthrough with no decode/re-encode step.
 */
export type GeoLine = string;

/** A closed ring of points — first and last need not be repeated; adapters that need a closed
 *  ring (Valhalla's `exclude_polygons`) close it themselves. */
export interface GeoPolygon {
  readonly points: readonly GeoPoint[];
}

/**
 * Decodes a polyline6-encoded `GeoLine` back into points — the Google encoded-polyline algorithm
 * at 1e6 precision (Valhalla's own default, per `GeoLine`'s own doc comment). Needed so the
 * hazard-avoidance adapter (M3.5) can turn a route's geometry into a corridor to query hazards
 * against; hand-rolled rather than a dependency, same "small, well-understood thing" reasoning as
 * decision 6/51 — the algorithm is a few dozen lines and has no material edge cases to get wrong.
 */
export function decodePolyline(line: GeoLine, precision = 6): GeoPoint[] {
  const factor = 10 ** precision;
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < line.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = line.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = line.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lon: lon / factor });
  }
  return points;
}

/** Metres per degree of latitude is near-constant; longitude shrinks with `cos(latitude)`. A
 *  flat-earth approximation, not a geodesic one — fine for a small avoid-zone box (tens of
 *  metres), the same scale of approximation the hazards module's in-memory test fake already
 *  uses for its own distance check. */
const METRES_PER_DEGREE_LAT = 111_320;

/**
 * A small axis-aligned square around a point, `halfWidthM` in each direction — how a single
 * reported hazard becomes an avoid *area* for Valhalla's `exclude_polygons` (design doc §5:
 * "small avoid polygons"), since a zero-area point can't be excluded. `AVOID_ZONE_HALF_WIDTH_M`
 * (routing/infrastructure/hazard-avoidance-query.ts) is a guess, not a derived number, same
 * status as the hazards module's own guessed radii.
 */
export function bufferPoint(point: GeoPoint, halfWidthM: number): GeoPolygon {
  const dLat = halfWidthM / METRES_PER_DEGREE_LAT;
  const dLon = halfWidthM / (METRES_PER_DEGREE_LAT * Math.cos((point.lat * Math.PI) / 180));
  return {
    points: [
      { lat: point.lat - dLat, lon: point.lon - dLon },
      { lat: point.lat - dLat, lon: point.lon + dLon },
      { lat: point.lat + dLat, lon: point.lon + dLon },
      { lat: point.lat + dLat, lon: point.lon - dLon },
    ],
  };
}
