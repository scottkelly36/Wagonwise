import { GB_ZONE_RINGS } from './gb-zone-boundaries.js';
import type { GeoPoint } from './geo.js';
import { SCOTTISH_LEZ_RINGS, type Ring } from './scottish-lez-boundaries.js';

export type { Ring };

/**
 * Low emission and clean air zones a lorry can enter, and whether it may be charged there: Scotland's four city-centre zones, seven English clean air zones
 * (Tyneside, Bradford, Sheffield, Birmingham, Bristol, Bath, Portsmouth) and London's. Oxford's zero-emission pilot is left out on purpose: its test is zero
 * emission, not Euro VI, so a Euro VI answer says nothing about it. A route is never planned round a zone: it only says "this route enters one".
 */

/** What a vehicle that does not meet the standard pays. A Scottish zone issues a penalty notice (no charge to pay in advance); an English zone has a daily charge. */
export type ZoneCharge =
  | {
      readonly kind: 'penalty';
      /** The penalty for a first breach, in pounds. It doubles for each further one within 90 days, up to a cap. */
      readonly firstGBP: number;
    }
  | {
      readonly kind: 'daily';
      /** The daily charge for a lorry, in pounds. The two differ when it depends on something we are not told (London's: £100, or £300 for one older than Euro IV). */
      readonly lowGBP: number;
      readonly highGBP: number;
    };

export interface LowEmissionZone {
  readonly id: string;
  readonly name: string;
  /** A zone can be several pieces (Edinburgh's has three, London's 22). */
  readonly rings: readonly Ring[];
  readonly charge: ZoneCharge;
  /** The day enforcement began (YYYY-MM-DD). */
  readonly enforcedFrom: string;
  /** Where the charge was read, and the day. */
  readonly sourceUrl: string;
  readonly checkedOn: string;
}

/**
 * Scotland: the standard for a heavy goods vehicle is Euro VI for a diesel and Euro IV for a petrol one, and the penalties are the same in all four (Schedule 4 of
 * the Low Emission Zones (Emission Standards, Exemptions and Enforcement) (Scotland) Regulations 2021): £60, then £120, £240, £480 and £960 a time for a vehicle in
 * the same zone within 90 days, half off if paid within 14 days. Enforcement dates are Transport Scotland's (published 2022).
 */
const REGULATIONS = 'https://www.legislation.gov.uk/ssi/2021/177/made';
const scottish = (
  id: string,
  name: string,
  rings: readonly Ring[],
  enforcedFrom: string,
): LowEmissionZone => ({
  id,
  name,
  rings,
  charge: { kind: 'penalty', firstGBP: 60 },
  enforcedFrom,
  sourceUrl: REGULATIONS,
  checkedOn: '2026-11-11',
});

/**
 * England: a non-compliant lorry pays a daily charge, and the standard for a heavy goods vehicle is Euro VI diesel in all seven (Euro 6 in the charging orders). The
 * rates were read from each council's own charges page on 2026-11-11, through search summaries of those pages, except Tyneside's, which is from the 2023 council pages and
 * is not confirmed as current. Birmingham's lorry charge is £50, not the £100 the owner's draft suggested. London: £100 a day, or £300 for a lorry older than Euro IV
 * (particulate), from TfL's payment page; the standard is Euro VI (NOx and PM) for a vehicle over 3.5 tonnes.
 */
const daily = (
  id: string,
  name: string,
  rings: readonly Ring[],
  gbp: number | readonly [number, number],
  enforcedFrom: string,
  sourceUrl: string,
): LowEmissionZone => ({
  id,
  name,
  rings,
  charge: {
    kind: 'daily',
    lowGBP: typeof gbp === 'number' ? gbp : gbp[0],
    highGBP: typeof gbp === 'number' ? gbp : gbp[1],
  },
  enforcedFrom,
  sourceUrl,
  checkedOn: '2026-11-11',
});

export const LOW_EMISSION_ZONES: readonly LowEmissionZone[] = [
  scottish('glasgow', 'Glasgow Low Emission Zone', SCOTTISH_LEZ_RINGS.glasgow, '2023-06-01'),
  scottish('edinburgh', 'Edinburgh Low Emission Zone', SCOTTISH_LEZ_RINGS.edinburgh, '2024-06-01'),
  scottish('dundee', 'Dundee Low Emission Zone', SCOTTISH_LEZ_RINGS.dundee, '2024-05-30'),
  scottish('aberdeen', 'Aberdeen Low Emission Zone', SCOTTISH_LEZ_RINGS.aberdeen, '2024-06-01'),
  daily(
    'tyneside',
    'Newcastle and Gateshead Clean Air Zone',
    GB_ZONE_RINGS.tyneside,
    50,
    '2023-01-30',
    'https://www.breathe-cleanair.com/',
  ),
  daily(
    'bradford',
    'Bradford Clean Air Zone',
    GB_ZONE_RINGS.bradford,
    50,
    '2022-09-26',
    'https://www.bradford.gov.uk/clean-air-zone/payments-and-charges/list-of-daily-charges/',
  ),
  daily(
    'sheffield',
    'Sheffield Clean Air Zone',
    GB_ZONE_RINGS.sheffield,
    50,
    '2023-02-27',
    'https://www.sheffield.gov.uk/clean-air-zone-sheffield/charges-and-refunds/clean-air-zone-charges-and-how-pay',
  ),
  daily(
    'birmingham',
    'Birmingham Clean Air Zone',
    GB_ZONE_RINGS.birmingham,
    50,
    '2021-06-01',
    'https://www.birmingham.gov.uk/info/20076/pollution/1763/a_clean_air_zone_for_birmingham',
  ),
  daily(
    'bristol',
    'Bristol Clean Air Zone',
    GB_ZONE_RINGS.bristol,
    100,
    '2022-11-28',
    'https://www.bristol.gov.uk/residents/streets-travel/bristols-caz/charges-and-vehicle-checker',
  ),
  daily(
    'bath',
    'Bath Clean Air Zone',
    GB_ZONE_RINGS.bath,
    100,
    '2021-03-15',
    'https://www.bathnes.gov.uk/find-out-bath-clean-air-zone-charges',
  ),
  daily(
    'portsmouth',
    'Portsmouth Clean Air Zone',
    GB_ZONE_RINGS.portsmouth,
    50,
    '2021-11-29',
    'https://www.portsmouth.gov.uk/services/parking-roads-and-travel/clean-air-zone-penalty-charge-notices/',
  ),
  daily(
    'london',
    'London Low Emission Zone',
    GB_ZONE_RINGS.london,
    [100, 300],
    '2008-02-04',
    'https://tfl.gov.uk/modes/driving/low-emission-zone/your-vehicle-and-lez',
  ),
];

/**
 * The credit shown beside the boundaries, wherever they are drawn. The Open Government Licence asks for a statement; Birmingham's CC-BY needs its council named. The
 * others are named as the bodies that publish the outlines.
 */
export const ZONE_BOUNDARY_CREDIT =
  'Zone boundaries: Improvement Service (Spatial Hub Scotland); Sheffield, Bristol, Birmingham, Bradford, Bath and Portsmouth councils; Gateshead Council; Greater London Authority and TfL. Contains public sector information licensed under the Open Government Licence v3.0 (Birmingham City Council data: CC-BY). Some outlines are approximate and some are from 2022: check the signs.';

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
  /** `charged`: the vehicle has been said not to meet the standard, so the charge applies. `may-be-charged`: it has not been said either way, which is never read as fine. */
  readonly status: 'charged' | 'may-be-charged';
  readonly charge: ZoneCharge;
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
    charge: zone.charge,
  }));
}
