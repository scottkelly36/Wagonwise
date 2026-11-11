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
        title: `${zone.name}: a £${zone.penaltyGBP} penalty for a vehicle that is not Euro VI`,
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
  zone: Pick<LowEmissionZoneDto, 'name' | 'penaltyGBP'>,
  euroVI: EuroVIState,
  fresh: boolean,
): ZoneNote {
  const lead = `${fresh ? 'In' : 'Last seen in'} the ${zone.name}.`;
  switch (euroVI) {
    case 'yes':
      return { text: `${lead} The vehicle is marked Euro VI.`, tone: 'ok' };
    case 'no':
      return {
        text: `${lead} The vehicle is not Euro VI: a £${zone.penaltyGBP} penalty applies, more if repeated.`,
        tone: 'danger',
      };
    case 'not-said':
      return {
        text: `${lead} Euro VI is not stated for this vehicle, so a £${zone.penaltyGBP} penalty may apply. Set it on the vehicle.`,
        tone: 'warn',
      };
    case 'unknown-vehicle':
      return { text: `${lead} Check whether the vehicle is Euro VI.`, tone: 'warn' };
  }
}
