import type {
  DriverId,
  GeoPoint,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
} from '../../domain/safe-parking-spot.js';
import type { ParkingRepository, SpotSearch } from '../ports/parking-repository.js';

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

  deleteOwned(id: SafeParkingSpotId, reporterId: DriverId): Promise<boolean> {
    const spot = this.#byId.get(id);
    if (spot === undefined || spot.reporterId !== reporterId) return Promise.resolve(false);
    this.#byId.delete(id);
    return Promise.resolve(true);
  }

  search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }> {
    const text = search.text?.toLowerCase();
    const matches = [...this.#byId.values()]
      .filter((s) => search.source === undefined || s.source === search.source)
      .filter(
        (s) =>
          text === undefined ||
          (s.name ?? '').toLowerCase().includes(text) ||
          (s.note ?? '').toLowerCase().includes(text),
      )
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return Promise.resolve({ spots: matches.slice(0, search.limit), total: matches.length });
  }

  countBySource(): Promise<Record<ParkingSource, number>> {
    const counts: Record<ParkingSource, number> = { driver: 0, admin: 0, osm: 0 };
    for (const s of this.#byId.values()) counts[s.source] += 1;
    return Promise.resolve(counts);
  }

  find(id: SafeParkingSpotId): Promise<SafeParkingSpot | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  update(spot: SafeParkingSpot): Promise<boolean> {
    if (!this.#byId.has(spot.id)) return Promise.resolve(false);
    this.#byId.set(spot.id, spot);
    return Promise.resolve(true);
  }

  deleteAny(id: SafeParkingSpotId): Promise<boolean> {
    return Promise.resolve(this.#byId.delete(id));
  }

  save(spot: SafeParkingSpot): Promise<void> {
    this.#byId.set(spot.id, spot);
    return Promise.resolve();
  }
}
