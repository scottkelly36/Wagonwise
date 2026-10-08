import type {
  CompanyId,
  DriverId,
  GeoPoint,
  SavedPlace,
  SavedPlaceId,
} from '../../domain/place.js';
import type { PlaceRepository } from '../ports/place-repository.js';

const METRES_PER_DEGREE = 111_320;

/** Flat-earth distance, good enough for a fake used in unit tests. */
function metres(a: GeoPoint, b: GeoPoint): number {
  const dx = (b.lon - a.lon) * METRES_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * METRES_PER_DEGREE;
  return Math.hypot(dx, dy);
}

export class InMemoryPlaceRepository implements PlaceRepository {
  readonly #byId = new Map<SavedPlaceId, SavedPlace>();

  findById(id: SavedPlaceId): Promise<SavedPlace | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<SavedPlace[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((p) => p.companyId === companyId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  findNear(companyId: CompanyId, point: GeoPoint, radiusM: number): Promise<SavedPlace[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((p) => p.companyId === companyId && metres(point, p.location) <= radiusM)
        .sort((a, b) => metres(point, a.location) - metres(point, b.location)),
    );
  }

  listForDriver(driverId: DriverId): Promise<SavedPlace[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter((p) => p.companyId === undefined && p.createdBy === driverId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  findNearForDriver(driverId: DriverId, point: GeoPoint, radiusM: number): Promise<SavedPlace[]> {
    return Promise.resolve(
      [...this.#byId.values()]
        .filter(
          (p) =>
            p.companyId === undefined &&
            p.createdBy === driverId &&
            metres(point, p.location) <= radiusM,
        )
        .sort((a, b) => metres(point, a.location) - metres(point, b.location)),
    );
  }

  save(place: SavedPlace): Promise<void> {
    this.#byId.set(place.id, place);
    return Promise.resolve();
  }

  shareWithCompany(id: SavedPlaceId, companyId: CompanyId, at: Date): Promise<void> {
    const place = this.#byId.get(id);
    if (place !== undefined) this.#byId.set(id, { ...place, companyId, updatedAt: at });
    return Promise.resolve();
  }

  delete(id: SavedPlaceId): Promise<void> {
    this.#byId.delete(id);
    return Promise.resolve();
  }
}
