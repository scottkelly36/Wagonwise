import type { Closure, NearbyClosures, NearbyClosuresQuery } from '../domain/closure.js';

export interface StoredClosureCounts {
  readonly closures: number;
  /** When the copy was last replaced; undefined before the first refresh. */
  readonly refreshedAt: Date | undefined;
}

/** Our copy of the closures feed. Written only by the refresh job, in one piece; read by drivers looking at the map. */
export interface ClosureRepository {
  /**
   * Makes the stored copy exactly these closures, atomically: a reader sees the old copy or the new one, never a mix, and a failure
   * part-way leaves the old copy as it was.
   */
  replaceAll(closures: readonly Closure[], refreshedAt: Date): Promise<void>;
  counts(): Promise<StoredClosureCounts>;
  /**
   * Closures whose line comes within the radius of the point, that have not ended and start before the cut-off, those in force
   * first, then the soonest to start, then the nearer. At most `limit`. Paused (suspended) ones are left out: they are not in force.
   */
  findNearby(query: NearbyClosuresQuery): Promise<NearbyClosures>;
}
