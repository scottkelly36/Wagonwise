import type { PlaceCategory } from '@wagonwise/contracts/places';

import type { IconName } from '../components/ui/icon';

/** The icon for each kind of saved place. Kept apart from `places.ts` because the map draws these, and
 *  `places.ts` needs the map's own types: one file importing the other would be a cycle. */
export const PLACE_CATEGORY_ICONS: Record<PlaceCategory, IconName> = {
  farm: 'barn',
  yard: 'warehouse',
  other: 'map-marker-star',
};
