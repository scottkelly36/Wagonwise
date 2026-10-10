import type {
  DriverId,
  GeoPoint,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
} from '../../domain/safe-parking-spot.js';

export interface SpotSearch {
  /** Words to find in the name or note, ignoring case. */
  readonly text?: string | undefined;
  readonly source?: ParkingSource | undefined;
  readonly limit: number;
}

export interface ParkingRepository {
  /** Candidates within `radiusM` of a corridor — mirrors hazards'/congestion's own
   *  `findNearbyLine` (a single-point corridor degrades to a plain radius check). */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]>;
  /** Insert-only for a driver's report — a safe-parking spot has no lifecycle to persist through repeated writes,
   *  same reasoning as congestion's `save` (no confirm/dismiss/expire path in v1). Staff add spots through this too. */
  save(spot: SafeParkingSpot): Promise<void>;
  /** Deletes the spot if it exists and was reported by this driver; false if there was no such spot
   *  or it is someone else's. */
  deleteOwned(id: SafeParkingSpotId, reporterId: DriverId): Promise<boolean>;

  // --- for WagonWise staff ---
  /** Newest first, matching the search, and how many match in all. */
  search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }>;
  countBySource(): Promise<Record<ParkingSource, number>>;
  find(id: SafeParkingSpotId): Promise<SafeParkingSpot | null>;
  /** Replaces what staff may change on an existing spot; false if there is no such spot. */
  update(spot: SafeParkingSpot): Promise<boolean>;
  /** Deletes any spot; false if there was no such spot. */
  deleteAny(id: SafeParkingSpotId): Promise<boolean>;
}
