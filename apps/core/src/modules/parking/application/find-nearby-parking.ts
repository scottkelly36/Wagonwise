import type { GeoPoint, SafeParkingSpot } from '../domain/safe-parking-spot.js';
import type { ParkingRepository } from './ports/parking-repository.js';

export interface FindNearbyParkingDeps {
  readonly repo: Pick<ParkingRepository, 'findNearbyLine'>;
}

export interface FindNearbyParkingInput {
  readonly corridor: readonly GeoPoint[];
  readonly radiusM: number;
}

/** Powers the driver app's map markers — one point for "near me" (home screen), several (a
 *  decoded route polyline) for "near my route." No expiry filtering — unlike congestion's own
 *  `findNearbyCongestion`, a safe-parking spot never lapses on its own (docs/progress.md's M9
 *  scoping), so there's nothing to check against the current time here. */
export async function findNearbySafeParkingSpots(
  deps: FindNearbyParkingDeps,
  input: FindNearbyParkingInput,
): Promise<SafeParkingSpot[]> {
  return deps.repo.findNearbyLine(input.corridor, input.radiusM);
}
