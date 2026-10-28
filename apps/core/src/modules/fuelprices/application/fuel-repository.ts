import type { FuelSnapshot, FuelType, NearbyFuel, NearbyFuelQuery } from '../domain/fuel.js';

export interface StoredFuelCounts {
  readonly stations: number;
  readonly prices: number;
  /** When the copy was last replaced; undefined before the first refresh. */
  readonly refreshedAt: Date | undefined;
}

/** Our copy of Fuel Finder. Written only by the refresh job, in one piece; read by drivers asking for the cheapest fuel. */
export interface FuelRepository {
  /**
   * Makes the stored copy exactly the snapshot, atomically: a reader sees the old copy or the new one, never a mix, and a failure
   * part-way leaves the old copy as it was.
   */
  replaceAll(snapshot: FuelSnapshot, refreshedAt: Date): Promise<void>;
  counts(): Promise<StoredFuelCounts>;
  /** The median price of one fuel across every open station in the country; undefined when no station has one. */
  nationalMedian(fuelType: FuelType): Promise<number | undefined>;
  /**
   * Open stations within the radius that have a price for the fuel (at least `minPencePerLitre`, reported since `updatedSince`),
   * cheapest first, nearer first among equals, at most `limit`.
   */
  findNearby(query: NearbyFuelQuery): Promise<NearbyFuel>;
}
