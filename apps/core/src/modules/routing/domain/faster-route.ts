import type { GeoPoint } from './geo.js';

/** Further than this from the planned line and the driver has left the route, so there is no "rest of the
 *  route" to compare with (they are already being re-routed some other way). */
export const MAX_OFF_ROUTE_M = 150;

/** Not worth offering in the last few minutes of a trip. */
export const MIN_REMAINING_MIN = 10;

/** The least a faster route must save: the larger of this and `MIN_SAVING_FRACTION` of the time left. */
export const MIN_SAVING_MIN = 5;
export const MIN_SAVING_FRACTION = 0.1;

/** No nagging: one offer per trip every 10 minutes and three an hour (the same hourly limit hazard alerts use). */
export const OFFER_GAP_MS = 10 * 60 * 1000;
export const MAX_OFFERS_PER_HOUR = 3;
export const OFFER_WINDOW_MS = 60 * 60 * 1000;

/** Share of a route that needs a traffic reading before the reading is trusted for comparing routes. A route
 *  with little coverage looks quicker only because less of it was measured. */
export const MIN_TRAFFIC_COVERAGE = 0.5;

/** How far from a route a congestion report still counts as being on it. */
export const CONGESTION_ON_ROUTE_RADIUS_M = 50;

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function pathLengthM(points: readonly GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceM(points[i - 1] as GeoPoint, points[i] as GeoPoint);
  }
  return total;
}

/** The vertex of a line closest to a point, and how far away it is. Vertex-to-point, not segment-to-point:
 *  route lines have a vertex every few tens of metres, well inside `MAX_OFF_ROUTE_M`. */
export function nearestVertex(
  points: readonly GeoPoint[],
  position: GeoPoint,
): { readonly index: number; readonly distanceM: number } | undefined {
  let best: { index: number; distanceM: number } | undefined;
  points.forEach((point, index) => {
    const d = distanceM(point, position);
    if (best === undefined || d < best.distanceM) best = { index, distanceM: d };
  });
  return best;
}

/** Minutes of a route that is `fraction` of the way along a plan taking `totalMin`. */
export function minutesForShareOf(totalMin: number, remainingM: number, totalM: number): number {
  return totalM <= 0 ? 0 : totalMin * Math.min(1, remainingM / totalM);
}

export interface RouteTimeInputs {
  /** The engine's own time, which assumes clear roads. */
  readonly freeFlowMin: number;
  /** Minutes drivers have reported waiting on congestion on this route. */
  readonly crowdWaitMin: number;
  /** Seconds the provider says traffic adds; undefined when it is not to be used for this comparison. */
  readonly trafficDelaySec: number | undefined;
}

export function totalMinutes(t: RouteTimeInputs): number {
  return (
    t.freeFlowMin + t.crowdWaitMin + (t.trafficDelaySec === undefined ? 0 : t.trafficDelaySec / 60)
  );
}

export function requiredSavingMin(currentMin: number): number {
  return Math.max(MIN_SAVING_MIN, MIN_SAVING_FRACTION * currentMin);
}

/** A short, stable name for a route line, so the app can say "I kept the route I was offered" and the same line
 *  is not offered again. FNV-1a over the encoded line: not secret, only a name. */
export function routeKey(line: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < line.length; i++) {
    hash ^= line.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
