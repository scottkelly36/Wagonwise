import type { GeoPoint, SafeParkingSpot } from '../../domain/safe-parking-spot.js';

export interface ParkingRepository {
  /** Candidates within `radiusM` of a corridor — mirrors hazards'/congestion's own
   *  `findNearbyLine` (a single-point corridor degrades to a plain radius check). */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]>;
  /** Insert-only — a safe-parking spot has no lifecycle to persist through repeated writes,
   *  same reasoning as congestion's `save` (no confirm/dismiss/expire path in v1). */
  save(spot: SafeParkingSpot): Promise<void>;
}
