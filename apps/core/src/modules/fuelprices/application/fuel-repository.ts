import type { FuelSnapshot } from '../domain/fuel.js';

export interface StoredFuelCounts {
  readonly stations: number;
  readonly prices: number;
  /** When the copy was last replaced; undefined before the first refresh. */
  readonly refreshedAt: Date | undefined;
}

/** Our copy of Fuel Finder. Written only by the refresh job, in one piece. */
export interface FuelRepository {
  /**
   * Makes the stored copy exactly the snapshot, atomically: a reader sees the old copy or the new one, never a mix, and a failure
   * part-way leaves the old copy as it was.
   */
  replaceAll(snapshot: FuelSnapshot, refreshedAt: Date): Promise<void>;
  counts(): Promise<StoredFuelCounts>;
}
