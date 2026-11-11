import type { GeoPoint } from './geo.js';
import { SCOTTISH_LEZ_RINGS, type Ring } from './scottish-lez-boundaries.js';

export type { Ring };

/**
 * Low emission zones a lorry can enter, and whether it may be charged there. First Scotland's four city-centre zones; Tyneside, England's other clean air zones
 * and London are not here (see `docs/charges-routing-scope.md`). A route is never planned round a zone: it only says "this route enters one".
 */

export interface LowEmissionZone {
  readonly id: string;
  readonly name: string;
  /** A zone can be several pieces (Edinburgh's has three). */
  readonly rings: readonly Ring[];
  /** The penalty for a first breach by a vehicle that does not meet the standard, in pounds. It doubles for each further one within 90 days, up to a cap. */
  readonly penaltyGBP: number;
  /** The day enforcement began or begins (YYYY-MM-DD). */
  readonly enforcedFrom: string;
  /** Where the rules were read, and the day. */
  readonly sourceUrl: string;
  readonly checkedOn: string;
}

/**
 * Scotland's zones. The standard for a heavy goods vehicle is Euro VI for a diesel and Euro IV for a petrol one, and the penalties are the same in all four
 * (Schedule 4 of the Low Emission Zones (Emission Standards, Exemptions and Enforcement) (Scotland) Regulations 2021): £60, then £120, £240, £480 and £960 a
 * time for a vehicle in the same zone within 90 days, half off if paid within 14 days. Enforcement dates are Transport Scotland's (published 2022).
 */
const REGULATIONS = 'https://www.legislation.gov.uk/ssi/2021/177/made';
export const LOW_EMISSION_ZONES: readonly LowEmissionZone[] = [
  {
    id: 'glasgow',
    name: 'Glasgow Low Emission Zone',
    rings: SCOTTISH_LEZ_RINGS.glasgow,
    penaltyGBP: 60,
    enforcedFrom: '2023-06-01',
    sourceUrl: REGULATIONS,
    checkedOn: '2026-11-11',
  },
  {
    id: 'edinburgh',
    name: 'Edinburgh Low Emission Zone',
    rings: SCOTTISH_LEZ_RINGS.edinburgh,
    penaltyGBP: 60,
    enforcedFrom: '2024-06-01',
    sourceUrl: REGULATIONS,
    checkedOn: '2026-11-11',
  },
  {
    id: 'dundee',
    name: 'Dundee Low Emission Zone',
    rings: SCOTTISH_LEZ_RINGS.dundee,
    penaltyGBP: 60,
    enforcedFrom: '2024-05-30',
    sourceUrl: REGULATIONS,
    checkedOn: '2026-11-11',
  },
  {
    id: 'aberdeen',
    name: 'Aberdeen Low Emission Zone',
    rings: SCOTTISH_LEZ_RINGS.aberdeen,
    penaltyGBP: 60,
    enforcedFrom: '2024-06-01',
    sourceUrl: REGULATIONS,
    checkedOn: '2026-11-11',
  },
];

/** Whether a point is inside a ring (ray casting; a point exactly on the edge is not worth a rule). */
function inRing(point: GeoPoint, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as readonly [number, number];
    const [yj, xj] = ring[j] as readonly [number, number];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether a point is inside any piece of the zone. */
export function zoneContains(zone: Pick<LowEmissionZone, 'rings'>, point: GeoPoint): boolean {
  return zone.rings.some((ring) => inRing(point, ring));
}

const METRES_PER_DEGREE_LAT = 111_320;

/**
 * The route with a point added wherever two neighbours are further apart than `maxStepM`, so a straight stretch with a point at each end cannot cross a zone
 * unseen: a road through a small zone can have its nearest points both outside it. Straight lines between points, as the route is drawn.
 */
export function densify(points: readonly GeoPoint[], maxStepM = 50): readonly GeoPoint[] {
  const out: GeoPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as GeoPoint;
    out.push(a);
    const b = points[i + 1];
    if (b === undefined) continue;
    const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
    const dx = (b.lon - a.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
    const steps = Math.ceil(Math.hypot(dx, dy) / maxStepM);
    for (let s = 1; s < steps; s++) {
      out.push({
        lat: a.lat + ((b.lat - a.lat) * s) / steps,
        lon: a.lon + ((b.lon - a.lon) * s) / steps,
      });
    }
  }
  return out;
}

interface Bounds {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

function boundsOf(zone: Pick<LowEmissionZone, 'rings'>): Bounds {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const ring of zone.rings) {
    for (const [lat, lon] of ring) {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
    }
  }
  return { south, north, west, east };
}

/**
 * The zones a route enters, in the order it first does. `points` are the route's points (as drawn): a stretch with a long gap between points is
 * filled in first. A route that only runs along a zone's edge is not "in" it; one with a point inside is.
 */
export function zonesEntered(
  points: readonly GeoPoint[],
  zones: readonly LowEmissionZone[] = LOW_EMISSION_ZONES,
): readonly LowEmissionZone[] {
  if (points.length === 0 || zones.length === 0) return [];
  const bounds = zones.map(boundsOf);
  const first = new Map<number, number>();
  const line = densify(points);
  for (let p = 0; p < line.length; p++) {
    const point = line[p] as GeoPoint;
    for (let z = 0; z < zones.length; z++) {
      if (first.has(z)) continue;
      const b = bounds[z] as Bounds;
      if (point.lat < b.south || point.lat > b.north || point.lon < b.west || point.lon > b.east)
        continue;
      if (zoneContains(zones[z] as LowEmissionZone, point)) first.set(z, p);
    }
    if (first.size === zones.length) break;
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([z]) => zones[z] as LowEmissionZone);
}

/** What a route's passing through a zone means for this vehicle. */
export interface RouteZone {
  readonly id: string;
  readonly name: string;
  /** `charged`: the vehicle has been said not to meet the standard, so a penalty applies. `may-be-charged`: it has not been said either way, which is never read as fine. */
  readonly status: 'charged' | 'may-be-charged';
  readonly penaltyGBP: number;
}

/** What the table needs to know about the vehicle: whether it meets Euro VI, as its owner or driver says. Absent is "not stated". */
export interface ZonedVehicle {
  readonly euroVI?: boolean | undefined;
}

/**
 * The zones on a route that could cost this vehicle, with why. A vehicle that meets Euro VI is not charged, so a zone is left off its list; one that does not
 * is charged; one whose owner has not said may be. Never says a vehicle is compliant or that a charge will be waived (exemptions exist and are not known here).
 */
export function zonesForVehicle(
  entered: readonly LowEmissionZone[],
  vehicle: ZonedVehicle,
): readonly RouteZone[] {
  if (vehicle.euroVI === true) return [];
  return entered.map((zone) => ({
    id: zone.id,
    name: zone.name,
    status: vehicle.euroVI === false ? 'charged' : 'may-be-charged',
    penaltyGBP: zone.penaltyGBP,
  }));
}
