import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import { makeId } from '../../../shared/brand.js';
import type { ParkingRepository, SpotSearch } from '../application/ports/parking-repository.js';
import type {
  DriverId,
  GeoPoint,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
} from '../domain/safe-parking-spot.js';
import type { UntypedDb } from './db.js';

interface SafeParkingSpotRow {
  readonly id: string;
  readonly reporter_id: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly note: string | null;
  readonly reported_at: Date;
  readonly source: ParkingSource;
  readonly osm_id: string | null;
  readonly name: string | null;
  readonly capacity: number | null;
  readonly paid: boolean | null;
  readonly toilets: boolean | null;
  readonly showers: boolean | null;
  readonly shop: boolean | null;
  readonly food: boolean | null;
  readonly fuel: boolean | null;
  readonly lit: boolean | null;
  readonly secure: boolean | null;
}

const SELECT_COLUMNS = `
  id, reporter_id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  note, reported_at, source, osm_id, name, capacity,
  paid, toilets, showers, shop, food, fuel, lit, secure
`;

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

function toDomain(row: SafeParkingSpotRow): SafeParkingSpot {
  return {
    id: makeId<'SafeParkingSpotId'>(row.id),
    reporterId: row.reporter_id === null ? undefined : makeId<'DriverId'>(row.reporter_id),
    location: { lat: row.lat, lon: row.lon },
    note: row.note ?? undefined,
    reportedAt: row.reported_at,
    source: row.source,
    osmId: orUndefined(row.osm_id),
    name: orUndefined(row.name),
    capacity: orUndefined(row.capacity),
    paid: orUndefined(row.paid),
    toilets: orUndefined(row.toilets),
    showers: orUndefined(row.showers),
    shop: orUndefined(row.shop),
    food: orUndefined(row.food),
    fuel: orUndefined(row.fuel),
    lit: orUndefined(row.lit),
    secure: orUndefined(row.secure),
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
        (id, reporter_id, location, note, reported_at, source, osm_id, name, capacity,
         paid, toilets, showers, shop, food, fuel, lit, secure)
      values (
        ${spot.id}, ${spot.reporterId ?? null},
        ST_SetSRID(ST_MakePoint(${spot.location.lon}, ${spot.location.lat}), 4326)::geography,
        ${spot.note ?? null}, ${spot.reportedAt}, ${spot.source}, ${spot.osmId ?? null},
        ${spot.name ?? null}, ${spot.capacity ?? null},
        ${spot.paid ?? null}, ${spot.toilets ?? null}, ${spot.showers ?? null}, ${spot.shop ?? null},
        ${spot.food ?? null}, ${spot.fuel ?? null}, ${spot.lit ?? null}, ${spot.secure ?? null}
      )
    `.execute(this.db);
  }

  async search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }> {
    const pattern =
      search.text === undefined || search.text === '' ? null : `%${escapeLike(search.text)}%`;
    const source = search.source ?? null;
    const where = sql`
      where (${source}::text is null or source = ${source})
        and (${pattern}::text is null or name ilike ${pattern} or note ilike ${pattern})
    `;
    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots
      ${where}
      order by reported_at desc, id
      limit ${search.limit}
    `.execute(this.db);
    const total = await sql<{ n: number }>`
      select count(*)::int as n from parking.safe_parking_spots ${where}
    `.execute(this.db);
    return { spots: rows.map(toDomain), total: total.rows[0]?.n ?? 0 };
  }

  async countBySource(): Promise<Record<ParkingSource, number>> {
    const { rows } = await sql<{ source: ParkingSource; n: number }>`
      select source, count(*)::int as n from parking.safe_parking_spots group by source
    `.execute(this.db);
    const counts: Record<ParkingSource, number> = { driver: 0, admin: 0, osm: 0 };
    for (const row of rows) counts[row.source] = row.n;
    return counts;
  }

  async find(id: SafeParkingSpotId): Promise<SafeParkingSpot | null> {
    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  }

  async update(spot: SafeParkingSpot): Promise<boolean> {
    const { rows } = await sql`
      update parking.safe_parking_spots set
        location = ST_SetSRID(ST_MakePoint(${spot.location.lon}, ${spot.location.lat}), 4326)::geography,
        note = ${spot.note ?? null}, name = ${spot.name ?? null}, capacity = ${spot.capacity ?? null},
        paid = ${spot.paid ?? null}, toilets = ${spot.toilets ?? null}, showers = ${spot.showers ?? null},
        shop = ${spot.shop ?? null}, food = ${spot.food ?? null}, fuel = ${spot.fuel ?? null},
        lit = ${spot.lit ?? null}, secure = ${spot.secure ?? null}
      where id = ${spot.id}
      returning 1
    `.execute(this.db);
    return rows.length > 0;
  }

  async deleteAny(id: SafeParkingSpotId): Promise<boolean> {
    const { rows } = await sql`
      delete from parking.safe_parking_spots where id = ${id} returning 1
    `.execute(this.db);
    return rows.length > 0;
  }
}

/** Makes `%`, `_` and `\` in what a person typed match themselves in a LIKE pattern. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);
