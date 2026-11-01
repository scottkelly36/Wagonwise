import { sql } from 'kysely';
import type { ClosureRepository, StoredClosureCounts } from '../application/closure-repository.js';
import type {
  Closure,
  ClosureKind,
  ClosurePoint,
  ClosureStatus,
  NearbyClosures,
  NearbyClosuresQuery,
} from '../domain/closure.js';
import type { UntypedDb } from './db.js';

interface ClosureRow {
  readonly id: string;
  readonly situation_id: string;
  readonly kind: ClosureKind;
  readonly status: ClosureStatus;
  readonly road: string | null;
  readonly direction: string | null;
  readonly description: string;
  readonly location_text: string | null;
  readonly cause: string | null;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly lanes_closed: number;
  readonly lat: number;
  readonly lon: number;
  /** GeoJSON, as text. */
  readonly geojson: string;
  readonly updated_at: Date;
  readonly distance_m: number;
}

/** GeoJSON is [longitude, latitude]. */
function linesFromGeoJson(text: string): ClosurePoint[][] {
  const parsed = JSON.parse(text) as { coordinates?: [number, number][][] };
  return (parsed.coordinates ?? []).map((line) => line.map(([lon, lat]) => ({ lat, lon })));
}

const toClosure = (row: ClosureRow): Closure => ({
  id: row.id,
  situationId: row.situation_id,
  kind: row.kind,
  status: row.status,
  road: row.road ?? undefined,
  direction: row.direction ?? undefined,
  description: row.description,
  locationText: row.location_text ?? undefined,
  cause: row.cause ?? undefined,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  lanesClosed: row.lanes_closed,
  position: { lat: row.lat, lon: row.lon },
  lines: linesFromGeoJson(row.geojson),
  updatedAt: row.updated_at,
});

/** Rows sent to Postgres per statement: the whole country is a few hundred closures, so this is usually one statement. */
const CHUNK = 500;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Raw `sql` queries, not Kysely's typed builder, like every other repository here (decision 26). Each chunk goes in as one JSON
 * parameter and is unpacked by Postgres (`jsonb_to_recordset`), which keeps the statement small however many rows there are.
 */
export class PostgresClosureRepository implements ClosureRepository {
  constructor(private readonly db: UntypedDb) {}

  async replaceAll(closures: readonly Closure[], refreshedAt: Date): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // The copy is replaced whole: one statement empties the table and the inserts refill it, all in this transaction, so a
      // reader sees the old copy until the commit and the new one after it.
      await sql`delete from closures.closures`.execute(trx);
      for (const batch of chunks(closures)) {
        const rows = batch.map((c) => ({
          id: c.id,
          situation_id: c.situationId,
          kind: c.kind,
          status: c.status,
          road: c.road,
          direction: c.direction,
          description: c.description,
          location_text: c.locationText,
          cause: c.cause,
          starts_at: c.startsAt.toISOString(),
          ends_at: c.endsAt.toISOString(),
          lanes_closed: c.lanesClosed,
          lat: c.position.lat,
          lon: c.position.lon,
          geom: {
            type: 'MultiLineString',
            coordinates: c.lines.map((line) => line.map((p) => [p.lon, p.lat])),
          },
          updated_at: c.updatedAt.toISOString(),
        }));
        await sql`
          insert into closures.closures
            (id, situation_id, kind, status, road, direction, description, location_text, cause, starts_at, ends_at,
             lanes_closed, position, geometry, updated_at)
          select r.id, r.situation_id, r.kind, r.status, r.road, r.direction, r.description, r.location_text, r.cause,
                 r.starts_at, r.ends_at, r.lanes_closed,
                 ST_SetSRID(ST_MakePoint(r.lon, r.lat), 4326)::geography,
                 ST_SetSRID(ST_GeomFromGeoJSON(r.geom::text), 4326)::geography,
                 r.updated_at
          from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
            id text, situation_id text, kind text, status text, road text, direction text, description text,
            location_text text, cause text, starts_at timestamptz, ends_at timestamptz, lanes_closed integer,
            lat float8, lon float8, geom jsonb, updated_at timestamptz
          )
          -- The feed can list one record twice; the first wins rather than the whole refresh failing.
          on conflict (id) do nothing
        `.execute(trx);
      }
      await sql`
        insert into closures.refreshes (only_row, refreshed_at, closures)
        values (true, ${refreshedAt.toISOString()}::timestamptz, ${closures.length})
        on conflict (only_row) do update set
          refreshed_at = excluded.refreshed_at, closures = excluded.closures
      `.execute(trx);
    });
  }

  async counts(): Promise<StoredClosureCounts> {
    const { rows } = await sql<{ closures: number; refreshed_at: Date | null }>`
      select (select count(*) from closures.closures)::int as closures,
             (select refreshed_at from closures.refreshes) as refreshed_at
    `.execute(this.db);
    const row = rows[0];
    return { closures: row?.closures ?? 0, refreshedAt: row?.refreshed_at ?? undefined };
  }

  async findNearby(query: NearbyClosuresQuery): Promise<NearbyClosures> {
    const centre = sql`ST_SetSRID(ST_MakePoint(${query.centre.lon}, ${query.centre.lat}), 4326)::geography`;
    const { rows } = await sql<ClosureRow>`
      select c.id, c.situation_id, c.kind, c.status, c.road, c.direction, c.description, c.location_text, c.cause,
             c.starts_at, c.ends_at, c.lanes_closed,
             ST_Y(c.position::geometry) as lat, ST_X(c.position::geometry) as lon,
             ST_AsGeoJSON(c.geometry::geometry) as geojson, c.updated_at,
             ST_Distance(c.geometry, ${centre}) as distance_m
      from closures.closures c
      where c.status <> 'suspended'
        and c.ends_at > ${query.now.toISOString()}::timestamptz
        and c.starts_at <= ${query.startsBefore.toISOString()}::timestamptz
        and ST_DWithin(c.geometry, ${centre}, ${query.radiusM})
      order by (c.status = 'active') desc, c.starts_at, distance_m, c.id
      limit ${query.limit}
    `.execute(this.db);
    const refreshed = await sql<{ refreshed_at: Date }>`
      select refreshed_at from closures.refreshes
    `.execute(this.db);
    return {
      closures: rows.map((row) => ({ closure: toClosure(row), distanceM: row.distance_m })),
      refreshedAt: refreshed.rows[0]?.refreshed_at ?? undefined,
    };
  }
}
