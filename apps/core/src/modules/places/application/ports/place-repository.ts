import type {
  CompanyId,
  DriverId,
  GeoPoint,
  SavedPlace,
  SavedPlaceId,
} from '../../domain/place.js';

export interface PlaceRepository {
  findById(id: SavedPlaceId): Promise<SavedPlace | null>;
  /** Every place of the company, by name. */
  listForCompany(companyId: CompanyId): Promise<SavedPlace[]>;
  /** The company's places within `radiusM` of `point`, nearest first. */
  findNear(companyId: CompanyId, point: GeoPoint, radiusM: number): Promise<SavedPlace[]>;
  /** A driver's personal places (no company), by name. */
  listForDriver(driverId: DriverId): Promise<SavedPlace[]>;
  /** A driver's personal places within `radiusM` of `point`, nearest first. */
  findNearForDriver(driverId: DriverId, point: GeoPoint, radiusM: number): Promise<SavedPlace[]>;
  /** Insert, or replace what is stored under the same id (name, category, note, updatedAt). */
  save(place: SavedPlace): Promise<void>;
  delete(id: SavedPlaceId): Promise<void>;
}
