import type {
  FuelStationDto,
  FuelTypeDto,
  UnpricedFuelStationDto,
} from '@wagonwise/contracts/fuel';

/** A station as the answer lists it, with a price or without one. */
type AnyFuelStation = FuelStationDto | UnpricedFuelStationDto;

/**
 * Prices older than this are not asked for at all. It was 7 days (owner's decision, 2026-10-29: older prices are irrelevant), but a
 * station that reported its petrol price this week and its diesel price ten days ago then showed petrol and no diesel, which made a
 * station that sells both look as if it did not. Since 2026-11-06 prices up to a month old are shown, the ones past
 * {@link FUEL_STALE_AFTER_DAYS} marked as possibly out of date, and a station with no usable price is listed with no number. The
 * one place to change it.
 */
export const FUEL_MAX_AGE_DAYS = 30;

/** A price reported longer ago than this is still shown, but marked "May be out of date". */
export const FUEL_STALE_AFTER_DAYS = 7;

/** Said beside a price that is older than {@link FUEL_STALE_AFTER_DAYS}. */
export const STALE_PRICE_NOTE = 'May be out of date';

/** Fuel Finder is Open Government Licence data; this is the line shown with the prices. */
export const FUEL_CREDIT = 'Prices from GOV.UK Fuel Finder, as the stations report them.';

/** Fuel Finder says nothing about whether a lorry can get on to a forecourt, so the driver is told to check. */
export const FUEL_ACCESS_NOTE = 'Fuel Finder does not say if a lorry fits. Check the entrance.';

export type FuelOrder = 'cheapest' | 'closest';

/** What a driver picks between: diesel (a lorry's grade) or petrol (a van or car's). */
export type FuelChoice = 'diesel' | 'petrol';

export const FUEL_CHOICES: readonly { readonly key: FuelChoice; readonly label: string }[] = [
  { key: 'diesel', label: 'Diesel' },
  { key: 'petrol', label: 'Petrol' },
];

/** The Fuel Finder grade behind each choice: ordinary diesel, and E10, the unleaded petrol every pump sells. */
export function fuelTypeFor(choice: FuelChoice): FuelTypeDto {
  return choice === 'diesel' ? 'B7_STANDARD' : 'E10';
}

/** The choice in words, for headings and labels. */
export function fuelName(choice: FuelChoice): string {
  return choice === 'diesel' ? 'Diesel' : 'Petrol';
}

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

/** Whether a price was reported longer ago than {@link FUEL_STALE_AFTER_DAYS}, so it may no longer be what the pump charges. */
export function isStalePrice(updatedAtIso: string, now: Date): boolean {
  return now.getTime() - new Date(updatedAtIso).getTime() > FUEL_STALE_AFTER_DAYS * MS_PER_DAY;
}

/** What a station with no usable price says in place of one: "No recent diesel price reported". */
export function noPriceText(fuelLabel: string): string {
  return `No recent ${fuelLabel.toLowerCase()} price reported`;
}

/** The station's address on one line, with whatever parts it has. */
export function addressText(station: AnyFuelStation): string | undefined {
  const parts = [station.addressLine, station.city, station.postcode].filter(
    (part): part is string => part !== undefined && part !== '',
  );
  return parts.length === 0 ? undefined : parts.join(', ');
}

/** The brand if there is one, else the station's own name, for a row's title. */
export function stationTitle(station: AnyFuelStation): string {
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
