import { distanceM } from './faster-route.js';
import type { GeoPoint, GeoPolygon } from './geo.js';

export type ObstructionKind = 'height' | 'width' | 'weight' | 'prohibition';

/**
 * A candidate restriction near a route (design doc §3) — a spatial hazards query finds what's
 * nearby; `applies()` (avoidance-policy.ts) decides whether it's relevant to a given vehicle.
 * `id` is opaque to routing: it never sees a `HazardReport`, `HazardType` or `HazardStatus`
 * (AGENTS.md rule 7 — cross-context reads use the consuming context's own types).
 */
export interface ReportedObstruction {
  readonly id: string;
  readonly kind: ObstructionKind;
  /** Metres for height/width, tonnes for weight. Absent means no measurement was given — still a
   *  real restriction (design doc §5: "no measurement means avoid for all"). Meaningless for
   *  `prohibition`, a categorical ban with nothing to measure. */
  readonly limit?: number;
  readonly zone: GeoPolygon;
  /** Only for a restriction the map holds as a point of the restricted road's own line (an OpenStreetMap limit mapped on a
   *  point, which the routing engine does not read). Absent for a driver's report, whose position is an estimate. */
  readonly roadPoint?: GeoPoint;
}

/** How near a point of the route must be to a `roadPoint` to be that same point: the two are the same map point, apart
 *  from rounding in the route's encoding (about 0.1 m). */
export const ROAD_POINT_TOLERANCE_M = 3;

/**
 * Whether a nearby obstruction is on the road the route uses. One with a `roadPoint` is only when the route's line has that
 * very point: a road along the restricted way passes through it, while a road that crosses over on a bridge (the A64 above
 * a low bridge on a lane) runs just as close but has no point there, and must not be sent round. One without (a driver's
 * report, a curated override) always is: being near the route is all that is known, and avoiding is the cautious answer.
 */
export function isOnRoute(obstruction: ReportedObstruction, route: readonly GeoPoint[]): boolean {
  const point = obstruction.roadPoint;
  if (point === undefined) return true;
  return route.some((p) => distanceM(p, point) <= ROAD_POINT_TOLERANCE_M);
}
