import type {
  GeoPoint,
  SafeParkingSpot,
  SafeParkingSpotId,
} from '../../domain/safe-parking-spot.js';
import type { ParkingRepository } from '../ports/parking-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — same approximation as
 *  hazards'/congestion's own in-memory repositories. */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryParkingRepository implements ParkingRepository {
  #byId = new Map<SafeParkingSpotId, SafeParkingSpot>();

  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]> {
    const matches = [...this.#byId.values()]
      .filter((spot) => points.some((p) => metresBetween(spot.location, p) <= radiusM))
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return Promise.resolve(matches);
  }

  save(spot: SafeParkingSpot): Promise<void> {
    this.#byId.set(spot.id, spot);
    return Promise.resolve();
  }
}
