import { sql } from 'kysely';
import type { FuelRepository, StoredFuelCounts } from '../application/fuel-repository.js';
import type {
  FuelSnapshot,
  FuelType,
  NearbyFuel,
  NearbyFuelQuery,
  NearbyFuelStation,
} from '../domain/fuel.js';
import type { UntypedDb } from './db.js';

interface NearbyRow {
  readonly id: string;
  readonly name: string;
  readonly brand: string | null;
  readonly address_line: string | null;
  readonly city: string | null;
  readonly postcode: string | null;
  readonly phone: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly is_motorway: boolean;
  readonly is_supermarket: boolean;
  readonly closed: boolean;
  readonly amenities: string[];
  readonly pence: number;
  readonly updated_at: Date;
  readonly distance_m: number;
}

const toNearby = (row: NearbyRow): NearbyFuelStation => ({
  station: {
    id: row.id,
    name: row.name,
    brand: row.brand ?? undefined,
    addressLine: row.address_line ?? undefined,
    city: row.city ?? undefined,
    postcode: row.postcode ?? undefined,
    phone: row.phone ?? undefined,
    position: { lat: row.lat, lon: row.lon },
    isMotorway: row.is_motorway,
    isSupermarket: row.is_supermarket,
    closed: row.closed,
    amenities: row.amenities,
  },
  pencePerLitre: row.pence,
  updatedAt: row.updated_at,
  distanceM: row.distance_m,
});

/** Rows sent to Postgres per statement: a country is about 8,000 stations and 26,000 prices, so a few dozen statements. */
const CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Raw `sql` queries, not Kysely's typed builder, like every other repository here (decision 26). Each chunk goes in as one JSON
 * parameter and is unpacked by Postgres (`jsonb_to_recordset`), which keeps the statement small however many rows there are.
 */
export class PostgresFuelRepository implements FuelRepository {
  constructor(private readonly db: UntypedDb) {}

  async replaceAll(snapshot: FuelSnapshot, refreshedAt: Date): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const batch of chunks(snapshot.stations)) {
        const rows = batch.map((s) => ({
          id: s.id,
          name: s.name,
          brand: s.brand,
          address_line: s.addressLine,
          city: s.city,
          postcode: s.postcode,
          phone: s.phone,
          lat: s.position.lat,
          lon: s.position.lon,
          is_motorway: s.isMotorway,
          is_supermarket: s.isSupermarket,
          closed: s.closed,
          amenities: s.amenities,
        }));
        await sql`
          insert into fuelprices.stations
            (id, name, brand, address_line, city, postcode, phone, location, is_motorway, is_supermarket, closed, amenities)
          select r.id, r.name, r.brand, r.address_line, r.city, r.postcode, r.phone,
                 ST_SetSRID(ST_MakePoint(r.lon, r.lat), 4326)::geography,
                 r.is_motorway, r.is_supermarket, r.closed,
                 array(select jsonb_array_elements_text(r.amenities))
          from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
            id text, name text, brand text, address_line text, city text, postcode text, phone text,
            lat float8, lon float8, is_motorway boolean, is_supermarket boolean, closed boolean, amenities jsonb
          )
          on conflict (id) do update set
            name = excluded.name, brand = excluded.brand, address_line = excluded.address_line, city = excluded.city,
            postcode = excluded.postcode, phone = excluded.phone, location = excluded.location,
            is_motorway = excluded.is_motorway, is_supermarket = excluded.is_supermarket, closed = excluded.closed,
            amenities = excluded.amenities
        `.execute(trx);
      }
      // A station that is gone from Fuel Finder is gone from here; its prices go with it (on delete cascade).
      await sql`
        delete from fuelprices.stations where id <> all(${snapshot.stations.map((s) => s.id)}::text[])
      `.execute(trx);

      // Prices are replaced whole: one statement empties the table and the inserts refill it, all in this transaction, so a
      // reader sees the old prices until the commit and the new ones after it.
      await sql`delete from fuelprices.prices`.execute(trx);
      for (const batch of chunks(snapshot.prices)) {
        const rows = batch.map((p) => ({
          station_id: p.stationId,
          fuel_type: p.fuelType,
          pence: p.pencePerLitre,
          updated_at: p.updatedAt.toISOString(),
        }));
        await sql`
          insert into fuelprices.prices (station_id, fuel_type, pence_per_litre, updated_at)
          select r.station_id, r.fuel_type, r.pence, r.updated_at
          from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
            station_id text, fuel_type text, pence numeric, updated_at timestamptz
          )
          on conflict (station_id, fuel_type) do update set
            pence_per_litre = excluded.pence_per_litre, updated_at = excluded.updated_at
        `.execute(trx);
      }

      await sql`
        insert into fuelprices.refreshes (only_row, refreshed_at, stations, prices)
        values (true, ${refreshedAt.toISOString()}::timestamptz, ${snapshot.stations.length}, ${snapshot.prices.length})
        on conflict (only_row) do update set
          refreshed_at = excluded.refreshed_at, stations = excluded.stations, prices = excluded.prices
      `.execute(trx);
    });
  }

  async nationalMedian(fuelType: FuelType): Promise<number | undefined> {
    const { rows } = await sql<{ median: number | null }>`
      select percentile_cont(0.5) within group (order by p.pence_per_litre)::float8 as median
      from fuelprices.prices p
      join fuelprices.stations s on s.id = p.station_id
      where p.fuel_type = ${fuelType} and not s.closed
    `.execute(this.db);
    return rows[0]?.median ?? undefined;
  }

  async findNearby(query: NearbyFuelQuery): Promise<NearbyFuel> {
    const centre = sql`ST_SetSRID(ST_MakePoint(${query.centre.lon}, ${query.centre.lat}), 4326)::geography`;
    const notTooCheap =
      query.minPencePerLitre === undefined
        ? sql``
        : sql`and p.pence_per_litre >= ${query.minPencePerLitre}`;
    const notTooOld =
      query.updatedSince === undefined
        ? sql``
        : sql`and p.updated_at >= ${query.updatedSince.toISOString()}::timestamptz`;
    const { rows } = await sql<NearbyRow>`
      select s.id, s.name, s.brand, s.address_line, s.city, s.postcode, s.phone,
             ST_Y(s.location::geometry) as lat, ST_X(s.location::geometry) as lon,
             s.is_motorway, s.is_supermarket, s.closed, s.amenities,
             p.pence_per_litre::float8 as pence, p.updated_at,
             ST_Distance(s.location, ${centre}) as distance_m
      from fuelprices.stations s
      join fuelprices.prices p on p.station_id = s.id
      where p.fuel_type = ${query.fuelType}
        and not s.closed
        and ST_DWithin(s.location, ${centre}, ${query.radiusM})
        ${notTooCheap}
        ${notTooOld}
      order by p.pence_per_litre, distance_m, s.id
      limit ${query.limit}
    `.execute(this.db);
    const refreshed = await sql<{ refreshed_at: Date }>`
      select refreshed_at from fuelprices.refreshes
    `.execute(this.db);
    return {
      stations: rows.map(toNearby),
      refreshedAt: refreshed.rows[0]?.refreshed_at ?? undefined,
    };
  }

  async counts(): Promise<StoredFuelCounts> {
    const { rows } = await sql<{
      stations: number;
      prices: number;
      refreshed_at: Date | null;
    }>`
      select (select count(*) from fuelprices.stations)::int as stations,
             (select count(*) from fuelprices.prices)::int as prices,
             (select refreshed_at from fuelprices.refreshes) as refreshed_at
    `.execute(this.db);
    const row = rows[0];
    return {
      stations: row?.stations ?? 0,
      prices: row?.prices ?? 0,
      refreshedAt: row?.refreshed_at ?? undefined,
    };
  }
}
