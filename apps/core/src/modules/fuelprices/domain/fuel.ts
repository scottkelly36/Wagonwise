/** The fuel grades Fuel Finder reports. Diesel is `B7_STANDARD` (and `B7_PREMIUM`); a lorry runs on the standard grade. */
export const FUEL_TYPES = ['E10', 'E5', 'B7_STANDARD', 'B7_PREMIUM', 'B10', 'HVO'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export function isFuelType(value: string): value is FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value);
}

export interface FuelPosition {
  readonly lat: number;
  readonly lon: number;
}

/** A petrol station, as the government's Fuel Finder describes it. `id` is theirs and stays the same between refreshes. */
export interface FuelStation {
  readonly id: string;
  readonly name: string;
  readonly brand: string | undefined;
  readonly addressLine: string | undefined;
  readonly city: string | undefined;
  readonly postcode: string | undefined;
  readonly phone: string | undefined;
  readonly position: FuelPosition;
  readonly isMotorway: boolean;
  readonly isSupermarket: boolean;
  /** Closed for now or for good: its last price is not worth showing. */
  readonly closed: boolean;
  readonly amenities: readonly string[];
}

/** One fuel's price at one station, in pence per litre (so 198.9 is £1.989). */
export interface FuelPrice {
  readonly stationId: string;
  readonly fuelType: FuelType;
  readonly pencePerLitre: number;
  /** When the retailer last reported it. Many stations report rarely, so a reader must see how old a price is. */
  readonly updatedAt: Date;
}

/** Everything Fuel Finder knows, at one moment. */
export interface FuelSnapshot {
  readonly stations: readonly FuelStation[];
  readonly prices: readonly FuelPrice[];
}

/** Fuel Finder could not be reached, refused our sign-in, or sent something unusable. Nothing partial is ever returned. */
export interface FuelSourceUnavailable {
  readonly tag: 'FuelSourceUnavailable';
}

/**
 * What came back from Fuel Finder is far smaller than what is stored (or is nearly empty), which is a fault at their end or in
 * the clean-up, never a country that lost its petrol stations. The stored copy is left as it was.
 */
export interface SnapshotTooSmall {
  readonly tag: 'SnapshotTooSmall';
  readonly received: number;
  readonly stored: number;
}

/**
 * A position inside the United Kingdom's bounding box. Catches coordinates a retailer typed wrongly (swapped, or zero) before they
 * put a station in the sea; it is a sanity check, not a border.
 */
export function isPlausibleUkPosition(position: FuelPosition): boolean {
  return position.lat >= 49.8 && position.lat <= 61 && position.lon >= -8.7 && position.lon <= 1.9;
}

/**
 * A pump price in pence per litre that could be real. Retailers sometimes enter pounds (1.99) or an extra digit (1989); those are
 * dropped rather than shown. The range is wide on purpose: it must still hold if prices spike.
 */
export function isPlausiblePencePerLitre(price: number): boolean {
  return Number.isFinite(price) && price >= 50 && price <= 500;
}

/** What a driver asks for: the stations around a point selling one fuel, cheapest first. */
export interface NearbyFuelQuery {
  readonly centre: FuelPosition;
  readonly radiusM: number;
  readonly fuelType: FuelType;
  /** Prices under this are left out (see {@link MIN_SHARE_OF_MEDIAN}); undefined when the country has no price to compare with. */
  readonly minPencePerLitre: number | undefined;
  /** Prices last reported before this moment are left out; undefined keeps every age. */
  readonly updatedSince: Date | undefined;
  readonly limit: number;
}

/** One station's price for the fuel asked about, with how far away it is in a straight line. */
export interface NearbyFuelStation {
  readonly station: FuelStation;
  readonly pencePerLitre: number;
  readonly updatedAt: Date;
  readonly distanceM: number;
}

export interface NearbyFuel {
  readonly stations: readonly NearbyFuelStation[];
  /** When our copy of Fuel Finder was last replaced; undefined before the first refresh. */
  readonly refreshedAt: Date | undefined;
}

/**
 * A price under this share of the national median for its fuel is a typing slip (14.29 for 142.9, a missing digit), not a bargain:
 * the lowest real diesel price seen was 142.9p against a median near 199p, 72% of it. A cheapest-first list would otherwise send
 * a driver to the one station whose retailer slipped. High prices need no guard; they sort to the bottom.
 */
export const MIN_SHARE_OF_MEDIAN = 0.6;
