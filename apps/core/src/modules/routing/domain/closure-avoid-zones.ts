import type { GeoPoint, GeoPolygon } from './geo.js';
import type { IndexedRoute, PlacedClosure } from './closure-on-route.js';

/**
 * Valhalla can only be told to avoid an _area_, and it avoids every road that touches the area, in both directions. A closure is
 * usually one carriageway of a dual road, with the other carriageway open only 12 to 30 m away, so the area has to be thin and sit
 * exactly on the carriageway the route uses. National Highways' line is not exact enough for that, so the zones are laid along the
 * **route's own line** (the road as the router has it) at the places where it runs along the closure.
 *
 * Checked on 2026-11-02 against the local Valhalla on the A1 north of Newcastle (carriageways 12 to 16 m apart): zones 10 m long and 6 m
 * wide on the northbound carriageway sent the northbound route round and left the southbound route exactly as it was; the same with
 * zones up to 16 m wide. One zone was enough to shut the carriageway, as Valhalla drops a whole road between two junctions that a
 * zone touches.
 */
export const ZONE_HALF_LENGTH_M = 5;
export const ZONE_HALF_WIDTH_M = 3;

/** Zones along a closure are this far apart, so a route that joins the shut road between two junctions, in the middle of the closure,
 *  still meets one before the next junction. */
export const ZONE_SPACING_M = 100;

/** No zone within this far of either end of the stretch the route runs along a closure. Where a slip road leaves the main road, or
 *  joins a roundabout, it is within a few metres of other roads, and a zone there shuts those as well. Checked against the slip road
 *  off the A1 at Morpeth on 2026-11-02: zones 20 m from its ends also shut the A1 itself; 40 m did not. 60 leaves room. */
export const ZONE_END_INSET_M = 60;

/** Valhalla refuses a request whose avoid areas have more than 10 km of edge in all (`max_exclude_polygons_length`). A zone has 32 m,
 *  and hazards use some too, so closures get at most this many zones between them. */
export const MAX_CLOSURE_ZONES = 100;

/** A closure's zones are thinned to this many, widening the gaps, so one very long closure does not use the lot. */
const MAX_ZONES_PER_CLOSURE = 40;

const METRES_PER_DEGREE_LAT = 111_320;

/** Where the route is `metres` along it, and which way it is heading there. */
export function atOffset(
  route: IndexedRoute,
  metres: number,
): { point: GeoPoint; headingDeg: number } {
  const { offsets, points } = route;
  let lo = 1;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! < metres) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1]!;
  const b = points[lo]!;
  const span = offsets[lo]! - offsets[lo - 1]!;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (metres - offsets[lo - 1]!) / span));
  const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lon - a.lon) * perDegreeLon;
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return {
    point: { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) },
    headingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
  };
}

/** A thin rectangle centred on `at`, long in the direction `headingDeg`. */
function thinRectangle(at: GeoPoint, headingDeg: number): GeoPolygon {
  const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((at.lat * Math.PI) / 180);
  const heading = (headingDeg * Math.PI) / 180;
  const alongX = Math.sin(heading);
  const alongY = Math.cos(heading);
  const acrossX = alongY;
  const acrossY = -alongX;
  const corner = (along: number, across: number): GeoPoint => ({
    lat: at.lat + (alongY * along + acrossY * across) / METRES_PER_DEGREE_LAT,
    lon: at.lon + (alongX * along + acrossX * across) / perDegreeLon,
  });
  return {
    points: [
      corner(-ZONE_HALF_LENGTH_M, -ZONE_HALF_WIDTH_M),
      corner(ZONE_HALF_LENGTH_M, -ZONE_HALF_WIDTH_M),
      corner(ZONE_HALF_LENGTH_M, ZONE_HALF_WIDTH_M),
      corner(-ZONE_HALF_LENGTH_M, ZONE_HALF_WIDTH_M),
    ],
  };
}

/** The offsets to put zones at: not near either end ({@link ZONE_END_INSET_M}), then the first and each one at least
 *  {@link ZONE_SPACING_M} on from the last picked, thinned if there are too many. */
function spacedOffsets(matchedM: readonly number[]): number[] {
  const first = matchedM[0];
  const last = matchedM[matchedM.length - 1];
  if (first === undefined || last === undefined) return [];
  // Leave out the ends; for a closure too short to have any middle, the one place nearest its middle.
  const inside = matchedM.filter(
    (m) => m >= first + ZONE_END_INSET_M && m <= last - ZONE_END_INSET_M,
  );
  const middle = (first + last) / 2;
  const candidates =
    inside.length > 0
      ? inside
      : [matchedM.reduce((best, m) => (Math.abs(m - middle) < Math.abs(best - middle) ? m : best))];
  const picked: number[] = [];
  for (const m of candidates) {
    const previous = picked[picked.length - 1];
    if (previous === undefined || m - previous >= ZONE_SPACING_M) picked.push(m);
  }
  const step = Math.ceil(picked.length / MAX_ZONES_PER_CLOSURE);
  return step <= 1 ? picked : picked.filter((_, i) => i % step === 0);
}

/**
 * The areas to avoid so a new route does not drive the shut carriageway the old one did: thin zones along the route's own line, at the
 * places where it runs along each closure. No more than `maxZones` in all; closures nearest the start come first.
 */
/** The metres along a stretch of the route to test for zones: dense enough that {@link ZONE_SPACING_M} decides the spacing. */
const STRETCH_STEP_M = 50;

/**
 * The areas to avoid so a new route does not take the stretch of road the old one did between `fromM` and `toM` along it: the same thin
 * zones as for a closure, laid on the route's own line (a steep hill, not a shut road, but to the router it is the same: a road to keep off).
 * Not within {@link ZONE_END_INSET_M} of either end, and no more than `maxZones`.
 */
export function avoidZonesAlongStretch(
  route: IndexedRoute,
  fromM: number,
  toM: number,
  maxZones: number,
): GeoPolygon[] {
  const matchedM: number[] = [];
  for (let m = fromM; m <= toM; m += STRETCH_STEP_M) matchedM.push(m);
  const zones: GeoPolygon[] = [];
  for (const metres of spacedOffsets(matchedM)) {
    if (zones.length >= maxZones) break;
    const { point, headingDeg } = atOffset(route, metres);
    zones.push(thinRectangle(point, headingDeg));
  }
  return zones;
}

export function avoidZonesFor(
  route: IndexedRoute,
  closures: readonly PlacedClosure[],
  maxZones: number = MAX_CLOSURE_ZONES,
): GeoPolygon[] {
  const zones: GeoPolygon[] = [];
  for (const placed of closures) {
    for (const metres of spacedOffsets(placed.matchedM)) {
      if (zones.length >= maxZones) return zones;
      const { point, headingDeg } = atOffset(route, metres);
      zones.push(thinRectangle(point, headingDeg));
    }
  }
  return zones;
}
