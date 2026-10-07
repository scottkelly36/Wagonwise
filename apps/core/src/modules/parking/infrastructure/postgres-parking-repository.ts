import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import { makeId } from '../../../shared/brand.js';
import type { ParkingRepository } from '../application/ports/parking-repository.js';
import type {
  DriverId,
  GeoPoint,
  SafeParkingSpot,
  SafeParkingSpotId,
} from '../domain/safe-parking-spot.js';
import type { UntypedDb } from './db.js';

interface SafeParkingSpotRow {
  readonly id: string;
  readonly reporter_id: string;
  readonly lat: number;
  readonly lon: number;
  readonly note: string | null;
  readonly reported_at: Date;
}

const SELECT_COLUMNS = `
  id, reporter_id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  note, reported_at
`;

function toDomain(row: SafeParkingSpotRow): SafeParkingSpot {
  return {
    id: makeId<'SafeParkingSpotId'>(row.id),
    reporterId: makeId<'DriverId'>(row.reporter_id),
    location: { lat: row.lat, lon: row.lon },
    note: row.note ?? undefined,
    reportedAt: row.reported_at,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresParkingRepository implements ParkingRepository {
  constructor(private readonly db: UntypedDb) {}

  async findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]> {
    if (points.length === 0) {
      return [];
    }
    const [only, ...rest] = points;
    if (only && rest.length === 0) {
      const { rows } = await sql<SafeParkingSpotRow>`
        select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots
        where ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${only.lon}, ${only.lat}), 4326)::geography,
          ${radiusM}
        )
        order by reported_at desc
      `.execute(this.db);
      return rows.map(toDomain);
    }

    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots
      where ST_DWithin(
        location,
        ST_GeogFromText(${lineWkt(points)}),
        ${radiusM}
      )
      order by reported_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async deleteOwned(id: SafeParkingSpotId, reporterId: DriverId): Promise<boolean> {
    const { rows } = await sql`
      delete from parking.safe_parking_spots where id = ${id} and reporter_id = ${reporterId}
      returning 1
    `.execute(this.db);
    return rows.length > 0;
  }

  async save(spot: SafeParkingSpot): Promise<void> {
    await sql`
      insert into parking.safe_parking_spots
        (id, reporter_id, location, note, reported_at)
      values (
        ${spot.id}, ${spot.reporterId},
        ST_SetSRID(ST_MakePoint(${spot.location.lon}, ${spot.location.lat}), 4326)::geography,
        ${spot.note ?? null}, ${spot.reportedAt}
      )
    `.execute(this.db);
  }
}
