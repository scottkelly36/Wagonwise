import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import { makeId } from '../../../shared/brand.js';
import type { ParkingRepository, SpotSearch } from '../application/ports/parking-repository.js';
import type {
  GeoPoint,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
  SpotReport,
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
  readonly last_reported_at: Date;
  readonly reporter_count: number;
  readonly recent_notes: string[];
}

// The spot, with how many different drivers have reported it and their newest few notes (every note stays in
// parking.spot_reports; only the latest are sent to the map).
const SELECT_COLUMNS = `
  s.id, s.reporter_id, ST_Y(s.location::geometry) as lat, ST_X(s.location::geometry) as lon,
  s.note, s.reported_at, s.source, s.osm_id, s.name, s.capacity,
  s.paid, s.toilets, s.showers, s.shop, s.food, s.fuel, s.lit, s.secure, s.last_reported_at,
  (select count(distinct r.reporter_id)::int from parking.spot_reports r where r.spot_id = s.id) as reporter_count,
  coalesce(
    (select array_agg(n.note order by n.reported_at desc) from (
       select r.note, r.reported_at from parking.spot_reports r
       where r.spot_id = s.id and r.note is not null order by r.reported_at desc limit 3) n),
    '{}'::text[]) as recent_notes
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
    lastReportedAt: row.last_reported_at,
    reporterCount: row.reporter_count,
    recentNotes: row.recent_notes,
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
        select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots s
        where ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(${only.lon}, ${only.lat}), 4326)::geography,
          ${radiusM}
        )
        order by s.last_reported_at desc
      `.execute(this.db);
      return rows.map(toDomain);
    }

    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots s
      where ST_DWithin(
        s.location,
        ST_GeogFromText(${lineWkt(points)}),
        ${radiusM}
      )
      order by s.last_reported_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findNearest(point: GeoPoint, radiusM: number): Promise<SafeParkingSpot | null> {
    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots s
      where ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography,
        ${radiusM}
      )
      order by ST_Distance(s.location, ST_SetSRID(ST_MakePoint(${point.lon}, ${point.lat}), 4326)::geography), s.id
      limit 1
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  }

  async addReport(report: SpotReport): Promise<boolean> {
    const inserted = await sql`
      insert into parking.spot_reports (id, spot_id, reporter_id, note, reported_at)
      values (${report.id}, ${report.spotId}, ${report.reporterId}, ${report.note ?? null}, ${report.reportedAt})
      on conflict (id) do nothing
      returning 1
    `.execute(this.db);
    if (inserted.rows.length === 0) return false;
    // The newest report wins: it moves the last-reported time on and, for a spot a driver marked, becomes its note.
    // A spot staff wrote or that was imported keeps its own note; drivers' notes sit beside it.
    await sql`
      update parking.safe_parking_spots set
        last_reported_at = greatest(last_reported_at, ${report.reportedAt}),
        note = case when source = 'driver' and ${report.note ?? null}::text is not null
                     and ${report.reportedAt} >= last_reported_at then ${report.note ?? null} else note end
      where id = ${report.spotId}
    `.execute(this.db);
    return true;
  }

  async findReport(id: string): Promise<SpotReport | null> {
    const { rows } = await sql<{
      id: string;
      spot_id: string;
      reporter_id: string;
      note: string | null;
      reported_at: Date;
    }>`
      select id, spot_id, reporter_id, note, reported_at from parking.spot_reports where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          spotId: makeId<'SafeParkingSpotId'>(row.spot_id),
          reporterId: makeId<'DriverId'>(row.reporter_id),
          note: row.note ?? undefined,
          reportedAt: row.reported_at,
        };
  }

  async removeReport(id: string, reporterId: string): Promise<boolean> {
    const removed = await sql<{ spot_id: string }>`
      delete from parking.spot_reports where id = ${id} and reporter_id = ${reporterId} returning spot_id
    `.execute(this.db);
    const spotId = removed.rows[0]?.spot_id;
    if (spotId === undefined) return false;
    // A spot a driver made goes with its last report. Any other spot stays, and its note and time are worked out again.
    await sql`
      delete from parking.safe_parking_spots s
      where s.id = ${spotId} and s.source = 'driver'
        and not exists (select 1 from parking.spot_reports r where r.spot_id = s.id)
    `.execute(this.db);
    await sql`
      update parking.safe_parking_spots s set
        last_reported_at = greatest(
          s.reported_at,
          coalesce((select max(r.reported_at) from parking.spot_reports r where r.spot_id = s.id), s.reported_at)),
        note = case when s.source = 'driver'
                    then (select r.note from parking.spot_reports r where r.spot_id = s.id and r.note is not null
                          order by r.reported_at desc limit 1)
                    else s.note end
      where s.id = ${spotId}
    `.execute(this.db);
    return true;
  }

  async save(spot: SafeParkingSpot): Promise<void> {
    await sql`
      insert into parking.safe_parking_spots
        (id, reporter_id, location, note, reported_at, source, osm_id, name, capacity,
         paid, toilets, showers, shop, food, fuel, lit, secure, last_reported_at)
      values (
        ${spot.id}, ${spot.reporterId ?? null},
        ST_SetSRID(ST_MakePoint(${spot.location.lon}, ${spot.location.lat}), 4326)::geography,
        ${spot.note ?? null}, ${spot.reportedAt}, ${spot.source}, ${spot.osmId ?? null},
        ${spot.name ?? null}, ${spot.capacity ?? null},
        ${spot.paid ?? null}, ${spot.toilets ?? null}, ${spot.showers ?? null}, ${spot.shop ?? null},
        ${spot.food ?? null}, ${spot.fuel ?? null}, ${spot.lit ?? null}, ${spot.secure ?? null},
        ${spot.lastReportedAt ?? spot.reportedAt}
      )
    `.execute(this.db);
    if (spot.reporterId !== undefined) {
      await sql`
        insert into parking.spot_reports (id, spot_id, reporter_id, note, reported_at)
        values (${spot.id}, ${spot.id}, ${spot.reporterId}, ${spot.note ?? null}, ${spot.reportedAt})
      `.execute(this.db);
    }
  }

  async search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }> {
    const pattern =
      search.text === undefined || search.text === '' ? null : `%${escapeLike(search.text)}%`;
    const source = search.source ?? null;
    const where = sql`
      where (${source}::text is null or s.source = ${source})
        and (${pattern}::text is null or s.name ilike ${pattern} or s.note ilike ${pattern})
    `;
    const { rows } = await sql<SafeParkingSpotRow>`
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots s
      ${where}
      order by s.last_reported_at desc, s.id
      limit ${search.limit}
    `.execute(this.db);
    const total = await sql<{ n: number }>`
      select count(*)::int as n from parking.safe_parking_spots s ${where}
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
      select ${sql.raw(SELECT_COLUMNS)} from parking.safe_parking_spots s where s.id = ${id}
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
