export interface RoutePoint {
  readonly lat: number;
  readonly lon: number;
}

export interface RouteProgress {
  readonly traveledMetres: number;
  readonly remainingMetres: number;
  readonly totalMetres: number;
  /** 1 at the origin, 0 at the destination — clamped, so GPS noise or a position that's
   *  drifted slightly past either end can't push it outside [0, 1]. */
  readonly remainingFraction: number;
}

// Metres per degree of latitude is near-constant; longitude shrinks with cos(latitude) — the
// same flat-plane approximation core's `bufferPoint` (routing/domain/geo.ts) uses for a small
// avoid-zone box. A whole test-area route spans at most a couple of degrees, so one reference
// latitude for the entire route (rather than a full geodesic) is accurate enough for an ETA
// estimate, not a routing or safety decision.
const METRES_PER_DEGREE_LAT = 111_320;

interface LocalPoint {
  readonly x: number;
  readonly y: number;
}

function toLocalMetres(point: RoutePoint, metresPerDegreeLon: number): LocalPoint {
  return { x: point.lon * metresPerDegreeLon, y: point.lat * METRES_PER_DEGREE_LAT };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Where `position` is along `routeLine` (Valhalla's decoded [lon, lat] geometry, origin first)
 * — snaps to the nearest point on the route's own line rather than the nearest vertex, so a
 * live GPS fix a few metres off to either side still measures progress along the road, not a
 * jump between polyline points. The "distance travelled" half of a live-updating ETA
 * (`active-trip.tsx`); `remainingFraction` scales the plan's total duration down as the trip
 * progresses.
 */
export function routeProgress(
  routeLine: readonly (readonly [number, number])[],
  position: RoutePoint,
): RouteProgress {
  if (routeLine.length < 2) {
    return { traveledMetres: 0, remainingMetres: 0, totalMetres: 0, remainingFraction: 0 };
  }

  const refLat = routeLine[0][1];
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((refLat * Math.PI) / 180);
  const local = routeLine.map(([lon, lat]) => toLocalMetres({ lat, lon }, metresPerDegreeLon));
  const target = toLocalMetres(position, metresPerDegreeLon);

  let cumulativeMetres = 0;
  let traveledMetres = 0;
  let closestDistanceSq = Infinity;

  for (let i = 0; i < local.length - 1; i++) {
    const a = local[i];
    const b = local[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLengthSq = dx * dx + dy * dy;

    const t =
      segmentLengthSq === 0
        ? 0
        : clamp01(((target.x - a.x) * dx + (target.y - a.y) * dy) / segmentLengthSq);
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const distanceSq = (target.x - projX) ** 2 + (target.y - projY) ** 2;

    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      traveledMetres = cumulativeMetres + t * Math.sqrt(segmentLengthSq);
    }

    cumulativeMetres += Math.sqrt(segmentLengthSq);
  }

  const totalMetres = cumulativeMetres;
  const remainingMetres = Math.max(0, totalMetres - traveledMetres);
  const remainingFraction = totalMetres === 0 ? 0 : clamp01(remainingMetres / totalMetres);

  return { traveledMetres, remainingMetres, totalMetres, remainingFraction };
}
