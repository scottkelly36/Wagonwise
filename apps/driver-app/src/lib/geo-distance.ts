import type { MapPoint } from '../components/route-map';

// Metres per degree of latitude is near-constant; longitude shrinks with cos(latitude) — the
// same flat-plane approximation `route-progress.ts`'s `routeProgress` uses, for the same reason:
// accurate enough for a journey-scale distance, not a routing or safety decision.
const METRES_PER_DEGREE_LAT = 111_320;

/** Straight-line distance between two points, in metres. Used for "is the driver near this stop"
 *  (M5.4's arrival geofence) — there's no route line to snap onto for a company job yet (no
 *  `routePlanId` is ever set), unlike `hazardsAheadWithinRange`'s route-relative check. */
export function distanceMetres(a: MapPoint, b: MapPoint): number {
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lon - a.lon) * metresPerDegreeLon;
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}
