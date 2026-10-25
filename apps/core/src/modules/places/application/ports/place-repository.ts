import type {
  CompanyId,
  DriverId,
  GeoPoint,
  PlaceReportReason,
  ReportedPlace,
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
  /** Makes a personal place the company's (it keeps everything else, including who marked it). It is no longer public. */
  shareWithCompany(id: SavedPlaceId, companyId: CompanyId, at: Date): Promise<void>;
  /** Public places (any driver's) within `radiusM` of `point`, nearest first, at most `limit`; not those reported enough to hide. */
  findPublicNear(point: GeoPoint, radiusM: number, limit: number): Promise<SavedPlace[]>;
  /** Makes a personal place public or private again. */
  setPublic(id: SavedPlaceId, isPublic: boolean, at: Date): Promise<void>;
  /** Public places with at least one report, most reported first, at most `limit`. */
  listReported(limit: number): Promise<ReportedPlace[]>;
  /** Forgets every report of a place (a moderator has decided). */
  clearReports(id: SavedPlaceId): Promise<void>;
  /** Records a report; one per driver per place, a second changes nothing. */
  addReport(
    id: SavedPlaceId,
    reporter: DriverId,
    reason: PlaceReportReason,
    at: Date,
  ): Promise<void>;
}
