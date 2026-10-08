import type { PlaceCategory, SavedPlaceDto } from '@wagonwise/contracts/places';

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  farm: 'Farm',
  yard: 'Yard',
  other: 'Other',
};

const METRES_PER_DEGREE_LAT = 111_320;
const METRES_PER_MILE = 1609.344;

/** Flat-earth distance in metres, as the app uses: right to a few metres over the few kilometres this
 *  is for (is a marked gate near this postcode?). */
export function metresBetween(
  a: { readonly lat: number; readonly lon: number },
  b: { readonly lat: number; readonly lon: number },
): number {
  const dx = (b.lon - a.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
  return Math.hypot(dx, dy);
}

/** How far from a stop's postcode a marked place is still offered. A rural postcode centre can be a few
 *  kilometres from the real gate. */
export const NEAR_POSTCODE_M = 5000;

export interface PlaceNear {
  readonly place: SavedPlaceDto;
  readonly distanceM: number;
}

/** The places within `maxM` of `point`, nearest first. */
export function placesNearPoint(
  places: readonly SavedPlaceDto[],
  point: { readonly lat: number; readonly lon: number },
  maxM: number = NEAR_POSTCODE_M,
): PlaceNear[] {
  return places
    .map((place) => ({ place, distanceM: metresBetween(point, place.location) }))
    .filter((p) => p.distanceM <= maxM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** "0.4 mi" / "2.1 mi" for a distance in metres. */
export function milesText(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  return miles < 0.1 ? 'under 0.1 mi' : `${miles.toFixed(1)} mi`;
}

/** A link that shows the spot on a map (OpenStreetMap, no account needed). */
export function mapLink(location: { readonly lat: number; readonly lon: number }): string {
  const { lat, lon } = location;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
}
