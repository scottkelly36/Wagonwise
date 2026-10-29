import type { FuelStationDto } from '@wagonwise/contracts/fuel';

/**
 * Prices older than this are not asked for at all: many stations report rarely, and a price from last month says nothing about
 * what the pump charges today (owner's decision, 2026-10-29: older prices are irrelevant). The one place to change it.
 */
export const FUEL_MAX_AGE_DAYS = 7;

/** Fuel Finder is Open Government Licence data; this is the line shown with the prices. */
export const FUEL_CREDIT = 'Prices from GOV.UK Fuel Finder, as the stations report them.';

/** Fuel Finder says nothing about whether a lorry can get on to a forecourt, so the driver is told to check. */
export const FUEL_ACCESS_NOTE = 'Fuel Finder does not say if a lorry fits. Check the entrance.';

export type FuelOrder = 'cheapest' | 'closest';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The pump price as a driver reads it: 198.9 pence a litre, "198.9p". */
export function priceText(pencePerLitre: number): string {
  return `${pencePerLitre.toFixed(1)}p`;
}

/** When the station last reported its price, in words: "Updated 3 hours ago". */
export function updatedText(updatedAtIso: string, now: Date): string {
  const age = now.getTime() - new Date(updatedAtIso).getTime();
  if (age < MS_PER_MINUTE) return 'Updated just now';
  if (age < MS_PER_HOUR) {
    const minutes = Math.floor(age / MS_PER_MINUTE);
    return `Updated ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (age < MS_PER_DAY) {
    const hours = Math.floor(age / MS_PER_HOUR);
    return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const days = Math.floor(age / MS_PER_DAY);
  return days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
}

/** The station's address on one line, with whatever parts it has. */
export function addressText(station: FuelStationDto): string | undefined {
  const parts = [station.addressLine, station.city, station.postcode].filter(
    (part): part is string => part !== undefined && part !== '',
  );
  return parts.length === 0 ? undefined : parts.join(', ');
}

/** The brand if there is one, else the station's own name, for a row's title. */
export function stationTitle(station: FuelStationDto): string {
  return station.brand !== undefined && station.brand !== '' ? station.brand : station.name;
}

/** Cheapest first, or nearest first; a tie takes the other measure so the order never jumps about. */
export function sortFuel(
  stations: readonly FuelStationDto[],
  order: FuelOrder,
): readonly FuelStationDto[] {
  return [...stations].sort((a, b) =>
    order === 'cheapest'
      ? a.pencePerLitre - b.pencePerLitre || a.distanceM - b.distanceM
      : a.distanceM - b.distanceM || a.pencePerLitre - b.pencePerLitre,
  );
}
