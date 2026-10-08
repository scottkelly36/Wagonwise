import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { PlaceRepository } from '../application/ports/place-repository.js';
import type { CompanyId, DriverId, GeoPoint, SavedPlace, SavedPlaceId } from '../domain/place.js';
import type { UntypedDb } from './db.js';

interface PlaceRow {
  readonly id: string;
  readonly company_id: string | null;
  readonly category: SavedPlace['category'];
  readonly name: string;
  readonly note: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly created_by: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const SELECT_COLUMNS = `
  id, company_id, category, name, note, ST_Y(location::geometry) as lat,
  ST_X(location::geometry) as lon, created_by, created_at, updated_at
`;

function toDomain(row: PlaceRow): SavedPlace {
  return {
    id: makeId<'SavedPlaceId'>(row.id),
    companyId: row.company_id === null ? undefined : makeId<'CompanyId'>(row.company_id),
    category: row.category,
    name: row.name,
    note: row.note ?? undefined,
    location: { lat: row.lat, lon: row.lon },
    createdBy: row.created_by === null ? undefined : makeId<'DriverId'>(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0036) does
 *  the company filtering as well; the `company_id` conditions are the application's own. */
export class PostgresPlaceRepository implements PlaceRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: SavedPlaceId): Promise<SavedPlace | null> {
    const { rows } = await sql<PlaceRow>`
      select ${sql.raw(SELECT_COLUMNS)} from places.saved_places where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<SavedPlace[]> {
    const { rows } = await sql<PlaceRow>`
      select ${sql.raw(SELECT_COLUMNS)} from places.saved_places
      where company_id = ${companyId} order by lower(name), created_at
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findNear(companyId: CompanyId, point: GeoPoint, radiusM: number): Promise<SavedPlace[]> {
    const { rows } = await sql<PlaceRow>`
      select ${sql.raw(SELECT_COLUMNS)} from places.saved_places
      where company_id = ${companyId}
        and ST_DWithin(
          location, ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography, ${radiusM}
        )
      order by location <-> ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async listForDriver(driverId: DriverId): Promise<SavedPlace[]> {
    const { rows } = await sql<PlaceRow>`
      select ${sql.raw(SELECT_COLUMNS)} from places.saved_places
      where company_id is null and created_by = ${driverId} order by lower(name), created_at
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findNearForDriver(
    driverId: DriverId,
    point: GeoPoint,
    radiusM: number,
  ): Promise<SavedPlace[]> {
    const { rows } = await sql<PlaceRow>`
      select ${sql.raw(SELECT_COLUMNS)} from places.saved_places
      where company_id is null and created_by = ${driverId}
        and ST_DWithin(
          location, ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography, ${radiusM}
        )
      order by location <-> ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async save(place: SavedPlace): Promise<void> {
    await sql`
      insert into places.saved_places
        (id, company_id, category, name, note, location, created_by, created_at, updated_at)
      values (
        ${place.id}, ${place.companyId ?? null}, ${place.category}, ${place.name}, ${place.note ?? null},
        ST_SetSRID(ST_MakePoint(${place.location.lon}, ${place.location.lat}), 4326)::geography,
        ${place.createdBy ?? null}, ${place.createdAt}, ${place.updatedAt}
      )
      on conflict (id) do update
        set category = excluded.category, name = excluded.name, note = excluded.note,
            updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async shareWithCompany(id: SavedPlaceId, companyId: CompanyId, at: Date): Promise<void> {
    await sql`
      update places.saved_places set company_id = ${companyId}, updated_at = ${at}
      where id = ${id} and company_id is null
    `.execute(this.db);
  }

  /**
   * A driver deleted their account: their personal places go with it; the places they marked for a
   * company stay with the company, with nothing left to say who marked them. Safe to run twice.
   */
  async eraseDriver(driverId: DriverId): Promise<void> {
    await sql`
      delete from places.saved_places where company_id is null and created_by = ${driverId}
    `.execute(this.db);
    await sql`
      update places.saved_places set created_by = null where created_by = ${driverId}
    `.execute(this.db);
  }

  async delete(id: SavedPlaceId): Promise<void> {
    await sql`delete from places.saved_places where id = ${id}`.execute(this.db);
  }
}
