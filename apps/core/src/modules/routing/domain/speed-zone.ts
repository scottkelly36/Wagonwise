import type { GeoPoint } from './geo.js';

/**
 * What to show a driver about the speed limit along a route. Deliberately cautious: a wrong number is worse than none.
 *
 * - A limit the map holds becomes a number (30, 40, 50...), rounded to a limit the UK actually uses.
 * - A tagged 60 or 70 is the national speed limit, not a posted number. A lorry's own limit there is lower and
 *   depends on the vehicle and the road, which drivers know, so it shows as the national speed limit sign.
 * - A motorway with no limit in the map is the national speed limit too.
 * - Anything else (most town streets, lit roads without a sign) shows nothing. We never guess.
 */

/** A stretch of the route with something to show. `from` and `to` are fractions of the route's length, 0 to 1. A
 *  missing `limitMph` means the national speed limit. */
export interface SpeedZone {
  readonly from: number;
  readonly to: number;
  readonly limitMph?: number | undefined;
}

/** One road section along the route, as the router reports it. */
export interface RoadEdge {
  /** How much of the section the route uses, in any one unit (only the proportions matter). */
  readonly length: number;
  /** The limit in the map, in km/h. Anything else (absent, 0, "unlimited") means none is held. */
  readonly speedLimitKph: number | string | undefined;
  readonly roadClass: string | undefined;
  /** What the section is for: "road", "ramp", "turn_channel"... */
  readonly use: string | undefined;
}

const KPH_PER_MPH = 1.609344;
/** From this a tagged limit is the national speed limit, not a number to show. */
const NATIONAL_FROM_MPH = 60;
const STEP_MPH = 5;

type Posted = number | 'national' | undefined;

/** What one section says: a number of mph, `'national'`, or nothing. */
export function postedLimit(edge: RoadEdge): Posted {
  if (typeof edge.speedLimitKph === 'number' && edge.speedLimitKph > 0) {
    // 48 km/h is the map's 30 mph; rounding to the nearest 5 mph undoes the conversion.
    const mph = Math.round(edge.speedLimitKph / KPH_PER_MPH / STEP_MPH) * STEP_MPH;
    if (mph >= NATIONAL_FROM_MPH) return 'national';
    return mph >= STEP_MPH ? mph : undefined;
  }
  return edge.roadClass === 'motorway' && edge.use === 'road' ? 'national' : undefined;
}

/**
 * The route's sections as zones, side by side with equal neighbours joined. The sections cover the span from `start` to
 * `end` (fractions of the whole route) in proportion to their lengths, so a piece of a long route can be placed within it.
 */
export function zonesFromEdges(edges: readonly RoadEdge[], start = 0, end = 1): SpeedZone[] {
  const total = edges.reduce((sum, e) => sum + Math.max(e.length, 0), 0);
  if (total <= 0) return [];
  const at = (cumulative: number) => start + (cumulative / total) * (end - start);

  const zones: { from: number; to: number; posted: Exclude<Posted, undefined> }[] = [];
  let cumulative = 0;
  for (const edge of edges) {
    const from = cumulative;
    cumulative += Math.max(edge.length, 0);
    const posted = postedLimit(edge);
    if (posted === undefined || cumulative === from) continue;
    const last = zones[zones.length - 1];
    if (last !== undefined && last.posted === posted && last.to === at(from)) {
      last.to = at(cumulative);
    } else {
      zones.push({ from: at(from), to: at(cumulative), posted });
    }
  }
  return zones.map((z) => ({
    from: z.from,
    to: z.to,
    ...(z.posted === 'national' ? {} : { limitMph: z.posted }),
  }));
}

/** Joins zones that meet and show the same thing, e.g. where two pieces of a long route were read separately. */
export function joinZones(zones: readonly SpeedZone[]): SpeedZone[] {
  const out: SpeedZone[] = [];
  for (const zone of zones) {
    const last = out[out.length - 1];
    if (last !== undefined && last.limitMph === zone.limitMph && zone.from - last.to < 1e-9) {
      out[out.length - 1] = { ...last, to: zone.to };
    } else {
      out.push(zone);
    }
  }
  return out;
}

/** A stretch of the route that runs over a bridge, as the points where it starts and ends. Points, not a share of the route's length,
 *  because the app places them on its own copy of the route and a share can be tens of metres out on a long route: more than a
 *  short bridge. */
export interface BridgeStretch {
  readonly from: GeoPoint;
  readonly to: GeoPoint;
}

/** Everything read about the road along a route that the app shows or uses. */
export interface RoadFeatures {
  readonly zones: SpeedZone[];
  readonly bridges: BridgeStretch[];
}

/** One section of the route as the router reports it, with where it sits in the matched line. */
export interface BridgeEdge {
  readonly bridge: boolean;
  readonly beginShapeIndex: number;
  readonly endShapeIndex: number;
}

/**
 * The parts of the route that run over a bridge. A low-bridge restriction is on the road underneath, so such a hazard on one of
 * these stretches is not the driver's: they are going over the top. Neighbouring sections that are both bridge are one stretch.
 */
export function bridgesFromShape(
  edges: readonly BridgeEdge[],
  shape: readonly GeoPoint[],
): BridgeStretch[] {
  const out: BridgeStretch[] = [];
  let lastEnd = -1;
  for (const edge of edges) {
    if (!edge.bridge) continue;
    const from = shape[edge.beginShapeIndex];
    const to = shape[edge.endShapeIndex];
    if (from === undefined || to === undefined) continue;
    const last = out[out.length - 1];
    if (last !== undefined && edge.beginShapeIndex === lastEnd) {
      out[out.length - 1] = { from: last.from, to };
    } else {
      out.push({ from, to });
    }
    lastEnd = edge.endShapeIndex;
  }
  return out;
}

const SAME_POINT_DEGREES = 1e-6;
const samePoint = (a: GeoPoint, b: GeoPoint): boolean =>
  Math.abs(a.lat - b.lat) < SAME_POINT_DEGREES && Math.abs(a.lon - b.lon) < SAME_POINT_DEGREES;

/** Joins stretches that meet, e.g. where two pieces of a long route were read separately. */
export function joinBridges(stretches: readonly BridgeStretch[]): BridgeStretch[] {
  const out: BridgeStretch[] = [];
  for (const stretch of stretches) {
    const last = out[out.length - 1];
    if (last !== undefined && samePoint(last.to, stretch.from)) {
      out[out.length - 1] = { from: last.from, to: stretch.to };
    } else {
      out.push(stretch);
    }
  }
  return out;
}
