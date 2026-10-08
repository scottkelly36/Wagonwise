import type { PlaceCategory, SavedPlaceDto } from '@wagonwise/contracts/places';

import type { MapPoint } from '../components/route-map';
import type { IconName } from '../components/ui/icon';
import { distanceMetres } from './geo-distance';

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  farm: 'Farm',
  yard: 'Yard',
  other: 'Other',
};

export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, IconName> = {
  farm: 'barn',
  yard: 'warehouse',
  other: 'map-marker-star',
};

export const PLACE_CATEGORIES: readonly PlaceCategory[] = ['farm', 'yard', 'other'];

/** How far a postcode can be from the real gate, for offering "a place you marked near this stop". A
 *  rural postcode centre can be a few kilometres out. */
export const NEAR_STOP_M = 5000;

export interface PlaceWithDistance {
  readonly place: SavedPlaceDto;
  readonly distanceM: number;
}

/** The places within `maxM` of `point`, nearest first. */
export function placesNear(
  places: readonly SavedPlaceDto[],
  point: MapPoint,
  maxM: number = NEAR_STOP_M,
): PlaceWithDistance[] {
  return places
    .map((place) => ({ place, distanceM: distanceMetres(point, place.location) }))
    .filter((p) => p.distanceM <= maxM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** What a new place is called by default: the stop it is being marked for, or the category. */
export function defaultPlaceName(stopName: string | undefined, category: PlaceCategory): string {
  const name = stopName?.trim();
  return name !== undefined && name.length > 0 ? name : PLACE_CATEGORY_LABELS[category];
}

/** Which company a place marked now belongs to: the company of the job the driver is on, else their
 *  only active company, else none (a personal place). With several companies and no job there is no
 *  way to know, so it is personal rather than guessed. */
export function markingCompanyIdFor(
  jobCompanyId: string | undefined,
  activeCompanyIds: readonly string[],
): string | undefined {
  if (jobCompanyId !== undefined) return jobCompanyId;
  return activeCompanyIds.length === 1 ? activeCompanyIds[0] : undefined;
}
