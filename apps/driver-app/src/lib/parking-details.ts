import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

export const OSM_CREDIT = '© OpenStreetMap contributors';

/** Who the spot came from, in a few words; a spot from an older server is a driver's report. */
export function sourceText(spot: Pick<SafeParkingSpotDto, 'source' | 'kind'>): string {
  if (spot.kind === 'layby') return 'Lay-by · not checked for lorries';
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

export type FacilityIcon =
  | 'toilet'
  | 'shower'
  | 'cart'
  | 'silverware-fork-knife'
  | 'gas-station'
  | 'lightbulb-on'
  | 'shield-check';

export interface Facility {
  readonly key: 'toilets' | 'showers' | 'shop' | 'food' | 'fuel' | 'lit' | 'secure';
  readonly icon: FacilityIcon;
  readonly label: string;
  /** True only when it is known to be there. Grey on the card means not there, or not known yet. */
  readonly there: boolean;
}

const FACILITIES: readonly Omit<Facility, 'there'>[] = [
  { key: 'toilets', icon: 'toilet', label: 'Toilets' },
  { key: 'showers', icon: 'shower', label: 'Showers' },
  { key: 'shop', icon: 'cart', label: 'Shop' },
  { key: 'food', icon: 'silverware-fork-knife', label: 'Food' },
  { key: 'fuel', icon: 'gas-station', label: 'Fuel' },
  { key: 'lit', icon: 'lightbulb-on', label: 'Lit' },
  { key: 'secure', icon: 'shield-check', label: 'Secure' },
];

/**
 * Every facility the card can show, each marked as there or not. Only a spot that says so is "there" (green); one known to be
 * missing and one nobody has said anything about are both "not there" (grey), so the card never promises what nobody has
 * confirmed.
 */
export function facilityStates(spot: SafeParkingSpotDto): Facility[] {
  return FACILITIES.map((f) => ({ ...f, there: spot[f.key] === true }));
}

/** What it costs, when that is known: "Paid" or "Free". Nothing when it is not. */
export function costText(spot: Pick<SafeParkingSpotDto, 'paid'>): string | undefined {
  if (spot.paid === true) return 'Paid';
  if (spot.paid === false) return 'Free';
  return undefined;
}

/** "Space for about 40 lorries", or nothing when the number is not known. */
export function capacityText(spot: Pick<SafeParkingSpotDto, 'capacity'>): string | undefined {
  const n = spot.capacity;
  if (n === undefined || n <= 0) return undefined;
  return n === 1 ? 'Space for 1 lorry' : `Space for about ${n} lorries`;
}

/** "Reported by 3 drivers", or nothing when no driver has (an imported place, or one staff added). */
export function reportersText(spot: Pick<SafeParkingSpotDto, 'reporterCount'>): string | undefined {
  const n = spot.reporterCount;
  if (n === undefined || n <= 0) return undefined;
  return n === 1 ? 'Reported by 1 driver' : `Reported by ${n} drivers`;
}

/**
 * The notes to show, newest first: the drivers' latest notes, or the one note a spot has. At most three, with none repeated
 * (two drivers often say the same thing).
 */
export function notesToShow(spot: Pick<SafeParkingSpotDto, 'note' | 'recentNotes'>): string[] {
  const all =
    spot.recentNotes !== undefined && spot.recentNotes.length > 0
      ? spot.recentNotes
      : spot.note === undefined
        ? []
        : [spot.note];
  return [...new Set(all.map((n) => n.trim()).filter((n) => n !== ''))].slice(0, 3);
}

/** A roadside lay-by from OpenStreetMap that nobody has checked suits a lorry; a spot from an older server is not one. */
export const isLayby = (spot: Pick<SafeParkingSpotDto, 'kind'>): boolean => spot.kind === 'layby';

/** Only the lorry parks, truck stops, service areas and spots someone vouched for: what break planning and "nearest parking" offer. */
export function parkingOnly<T extends Pick<SafeParkingSpotDto, 'kind'>>(spots: readonly T[]): T[] {
  return spots.filter((s) => !isLayby(s));
}

/** Only the lay-bys, for their own layer on the map. */
export function laybysOnly<T extends Pick<SafeParkingSpotDto, 'kind'>>(spots: readonly T[]): T[] {
  return spots.filter(isLayby);
}
