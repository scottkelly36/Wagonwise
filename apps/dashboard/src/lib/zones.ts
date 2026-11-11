import type { LowEmissionZoneDto } from '@wagonwise/contracts/routing';

type Ring = LowEmissionZoneDto['rings'][number];

/** Whether a point is inside one outline (ray casting; a point exactly on the edge is not worth a rule). */
function inRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i] as [number, number];
    const [yj, xj] = ring[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** The zone a position is inside, if any. A zone can be several pieces; inside any of them counts. */
export function zoneAt(
  zones: readonly LowEmissionZoneDto[],
  point: { readonly lat: number; readonly lon: number },
): LowEmissionZoneDto | undefined {
  return zones.find((zone) => zone.rings.some((ring) => inRing(point.lat, point.lon, ring)));
}

/**
 * The zones as GeoJSON for the map: one feature per zone, its pieces as a multi-polygon (GeoJSON is [longitude, latitude], closed). `title` is what a click shows.
 */
export function zonesGeoJson(zones: readonly LowEmissionZoneDto[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => ({
      type: 'Feature' as const,
      properties: {
        title: `${zone.name}: ${chargeText(zone)} for a vehicle that is not Euro VI`,
      },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: zone.rings.map((ring) => {
          const lonLat = ring.map(([lat, lon]): [number, number] => [lon, lat]);
          return [[...lonLat, lonLat[0] as [number, number]]];
        }),
      },
    })),
  };
}

/** What the company has said about the vehicle's Euro VI: yes, no, not said, or the vehicle is not known to the page (not loaded, or the viewer cannot see vehicles). */
export type EuroVIState = 'yes' | 'no' | 'not-said' | 'unknown-vehicle';

export function euroVIState(
  vehicle: { readonly dimensions: { readonly euroVI?: boolean | undefined } } | undefined,
): EuroVIState {
  if (vehicle === undefined) return 'unknown-vehicle';
  if (vehicle.dimensions.euroVI === true) return 'yes';
  if (vehicle.dimensions.euroVI === false) return 'no';
  return 'not-said';
}

type ZoneCharge = Pick<LowEmissionZoneDto, 'kind' | 'penaltyGBP' | 'dailyChargeGBP'>;

/** The pounds a zone charges a lorry that does not meet the standard: "£60", "£50" a day, or London's "£100 to £300". Empty when the zone does not say. */
function amount(zone: ZoneCharge): string {
  if (zone.kind === 'daily') {
    const range = zone.dailyChargeGBP;
    if (range === undefined) return '';
    return range.lowGBP === range.highGBP
      ? `£${range.lowGBP}`
      : `£${range.lowGBP} to £${range.highGBP}`;
  }
  return zone.penaltyGBP === undefined ? '' : `£${zone.penaltyGBP}`;
}

/** What a vehicle that is not Euro VI pays in this zone, as a phrase: "a £60 penalty", "a £50 a day charge", "a £100 to £300 a day charge". */
export function chargeText(zone: ZoneCharge): string {
  const pounds = amount(zone);
  if (zone.kind === 'daily') return pounds === '' ? 'a daily charge' : `a ${pounds} a day charge`;
  return pounds === '' ? 'a penalty' : `a ${pounds} penalty`;
}

/** The sentence about what the charge means, for a vehicle known not to be Euro VI (`may` false) or one that has not said (`may` true). */
function consequence(zone: ZoneCharge, may: boolean): string {
  const what = chargeText(zone);
  if (zone.kind === 'daily') return `${what} ${may ? 'may apply.' : 'applies.'}`;
  return `${what} ${may ? 'may apply.' : 'applies, more if repeated.'}`;
}

export interface ZoneNote {
  readonly text: string;
  /** How loudly to show it: a penalty that applies is `danger`, one that may is `warn`, a vehicle marked Euro VI is `ok`. */
  readonly tone: 'ok' | 'warn' | 'danger';
}

/**
 * The line shown for a vehicle inside a zone. `fresh` is whether its last position is recent: an old position is "last seen in" the zone, not "in" it.
 * It never calls a vehicle compliant: it repeats what the company has said, and says a penalty "applies" or "may apply" from that.
 */
export function zoneNote(
  zone: Pick<LowEmissionZoneDto, 'name' | 'kind' | 'penaltyGBP' | 'dailyChargeGBP'>,
  euroVI: EuroVIState,
  fresh: boolean,
): ZoneNote {
  const lead = `${fresh ? 'In' : 'Last seen in'} the ${zone.name}.`;
  switch (euroVI) {
    case 'yes':
      return { text: `${lead} The vehicle is marked Euro VI.`, tone: 'ok' };
    case 'no':
      return {
        text: `${lead} The vehicle is not Euro VI: ${consequence(zone, false)}`,
        tone: 'danger',
      };
    case 'not-said':
      return {
        text: `${lead} Euro VI is not stated for this vehicle, so ${consequence(zone, true)} Set it on the vehicle.`,
        tone: 'warn',
      };
    case 'unknown-vehicle':
      return { text: `${lead} Check whether the vehicle is Euro VI.`, tone: 'warn' };
  }
}
