import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

export const OSM_CREDIT = '© OpenStreetMap contributors';

/** Who the spot came from, in a few words; a spot from an older server is a driver's report. */
export function sourceText(spot: Pick<SafeParkingSpotDto, 'source'>): string {
  switch (spot.source) {
    case 'osm':
      return 'From OpenStreetMap';
    case 'admin':
      return 'Added by WagonWise';
    case 'driver':
    case undefined:
      return 'Reported by a driver';
  }
}

export interface Chip {
  readonly icon:
    | 'cash'
    | 'toilet'
    | 'shower'
    | 'cart'
    | 'silverware-fork-knife'
    | 'gas-station'
    | 'lightbulb-on'
    | 'shield-check';
  readonly label: string;
}

/**
 * What is known to be at a spot, as chips. Only what is known to be there: a facility nobody has mentioned is left off,
 * and so is one known to be missing, so the card never promises or boasts. Cost comes first, and "Free" is said when it is
 * known to cost nothing.
 */
export function facilityChips(spot: SafeParkingSpotDto): Chip[] {
  const chips: Chip[] = [];
  if (spot.paid === true) chips.push({ icon: 'cash', label: 'Paid' });
  if (spot.paid === false) chips.push({ icon: 'cash', label: 'Free' });
  if (spot.toilets === true) chips.push({ icon: 'toilet', label: 'Toilets' });
  if (spot.showers === true) chips.push({ icon: 'shower', label: 'Showers' });
  if (spot.shop === true) chips.push({ icon: 'cart', label: 'Shop' });
  if (spot.food === true) chips.push({ icon: 'silverware-fork-knife', label: 'Food' });
  if (spot.fuel === true) chips.push({ icon: 'gas-station', label: 'Fuel' });
  if (spot.lit === true) chips.push({ icon: 'lightbulb-on', label: 'Lit' });
  if (spot.secure === true) chips.push({ icon: 'shield-check', label: 'Secure' });
  return chips;
}

/** "Space for about 40 lorries", or nothing when the number is not known. */
export function capacityText(spot: Pick<SafeParkingSpotDto, 'capacity'>): string | undefined {
  const n = spot.capacity;
  if (n === undefined || n <= 0) return undefined;
  return n === 1 ? 'Space for 1 lorry' : `Space for about ${n} lorries`;
}
