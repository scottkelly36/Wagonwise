import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FuelPrice, FuelSnapshot, FuelStation } from '../domain/fuel.js';
import type { UntypedDb } from './db.js';
import { PostgresFuelRepository } from './postgres-fuel-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const T0 = new Date('2026-10-27T10:00:00.000Z');
const T1 = new Date('2026-10-27T11:00:00.000Z');

const station = (id: string, overrides: Partial<FuelStation> = {}): FuelStation => ({
  id,
  name: `Station ${id}`,
  brand: 'TESCO',
  addressLine: 'LOWER BRIDGE STREET',
  city: 'PONTYPOOL',
  postcode: 'NP4 6JU',
  phone: '+448003234040',
  position: { lat: 54.97, lon: -2.1 },
  isMotorway: false,
  isSupermarket: true,
  closed: false,
  amenities: ['customer_toilets', 'water_filling'],
  ...overrides,
});

const price = (
  stationId: string,
  fuelType: FuelPrice['fuelType'],
  pencePerLitre: number,
  updatedAt = '2026-10-27T08:00:00.000Z',
): FuelPrice => ({ stationId, fuelType, pencePerLitre, updatedAt: new Date(updatedAt) });

describe('PostgresFuelRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await pool.query('delete from fuelprices.stations');
    await pool.query('delete from fuelprices.refreshes');
  });

  const repo = () => new PostgresFuelRepository(db);

  it('starts empty, with no refresh date', async () => {
    expect(await repo().counts()).toEqual({ stations: 0, prices: 0, refreshedAt: undefined });
  });

  it('stores stations and prices, and when it did so', async () => {
    const snapshot: FuelSnapshot = {
      stations: [station('a'), station('b', { brand: undefined, phone: undefined, amenities: [] })],
      prices: [price('a', 'B7_STANDARD', 198.9), price('a', 'E10', 167.9), price('b', 'HVO', 210)],
    };
    await repo().replaceAll(snapshot, T0);
    expect(await repo().counts()).toEqual({ stations: 2, prices: 3, refreshedAt: T0 });

    const { rows } = await pool.query<{ lat: number; lon: number }>(
      `select id, name, brand, address_line, city, postcode, phone, is_supermarket, closed, amenities,
              ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon
       from fuelprices.stations order by id`,
    );
    expect(rows[0]).toMatchObject({
      id: 'a',
      name: 'Station a',
      brand: 'TESCO',
      address_line: 'LOWER BRIDGE STREET',
      city: 'PONTYPOOL',
      postcode: 'NP4 6JU',
      phone: '+448003234040',
      is_supermarket: true,
      closed: false,
      amenities: ['customer_toilets', 'water_filling'],
    });
    expect(rows[0]?.lat).toBeCloseTo(54.97, 5);
    expect(rows[0]?.lon).toBeCloseTo(-2.1, 5);
    expect(rows[1]).toMatchObject({ id: 'b', brand: null, phone: null, amenities: [] });

    const prices = await pool.query<{
      station_id: string;
      fuel_type: string;
      pence: number;
      updated_at: Date;
    }>(
      `select station_id, fuel_type, pence_per_litre::float8 as pence, updated_at
       from fuelprices.prices order by station_id, fuel_type`,
    );
    expect(prices.rows.map((r) => [r.station_id, r.fuel_type, r.pence])).toEqual([
      ['a', 'B7_STANDARD', 198.9],
      ['a', 'E10', 167.9],
      ['b', 'HVO', 210],
    ]);
    expect(prices.rows[0]?.updated_at).toEqual(new Date('2026-10-27T08:00:00.000Z'));
  });

  it('makes the copy match a newer snapshot: changes, additions and removals', async () => {
    await repo().replaceAll(
      {
        stations: [station('a'), station('b'), station('gone')],
        prices: [
          price('a', 'B7_STANDARD', 198.9),
          price('a', 'E10', 167.9),
          price('b', 'B7_STANDARD', 201),
          price('gone', 'B7_STANDARD', 150),
        ],
      },
      T0,
    );
    await repo().replaceAll(
      {
        stations: [station('a', { name: 'Renamed', closed: true }), station('b'), station('new')],
        // a: diesel changed, and E10 is no longer reported. b: unchanged. new: a first price.
        prices: [
          price('a', 'B7_STANDARD', 195.5, '2026-10-27T10:30:00.000Z'),
          price('b', 'B7_STANDARD', 201),
          price('new', 'E5', 189.9),
        ],
      },
      T1,
    );

    expect(await repo().counts()).toEqual({ stations: 3, prices: 3, refreshedAt: T1 });
    const stations = await pool.query(
      'select id, name, closed from fuelprices.stations order by id',
    );
    expect(stations.rows).toEqual([
      { id: 'a', name: 'Renamed', closed: true },
      { id: 'b', name: 'Station b', closed: false },
      { id: 'new', name: 'Station new', closed: false },
    ]);
    const prices = await pool.query(
      `select station_id, fuel_type, pence_per_litre::float8 as pence from fuelprices.prices order by 1, 2`,
    );
    expect(prices.rows).toEqual([
      { station_id: 'a', fuel_type: 'B7_STANDARD', pence: 195.5 },
      { station_id: 'b', fuel_type: 'B7_STANDARD', pence: 201 },
      { station_id: 'new', fuel_type: 'E5', pence: 189.9 },
    ]);
  });

  it('copes with more rows than fit in one statement', async () => {
    const stations = Array.from({ length: 2500 }, (_, i) => station(`s${i}`));
    const prices = stations.map((s) => price(s.id, 'B7_STANDARD', 190 + (s.id.length % 7)));
    await repo().replaceAll({ stations, prices }, T0);
    expect(await repo().counts()).toEqual({ stations: 2500, prices: 2500, refreshedAt: T0 });
  });

  it('leaves the old copy exactly as it was when the new one cannot be stored', async () => {
    await repo().replaceAll(
      { stations: [station('a'), station('b')], prices: [price('a', 'B7_STANDARD', 198.9)] },
      T0,
    );
    // A price for a station that is not in the snapshot breaks the foreign key part-way through.
    await expect(
      repo().replaceAll(
        { stations: [station('c')], prices: [price('nobody', 'B7_STANDARD', 150)] },
        T1,
      ),
    ).rejects.toThrow();

    expect(await repo().counts()).toEqual({ stations: 2, prices: 1, refreshedAt: T0 });
    const ids = await pool.query('select id from fuelprices.stations order by id');
    expect(ids.rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('refuses a price that cannot be real, whatever the caller checked', async () => {
    await expect(
      repo().replaceAll(
        { stations: [station('a')], prices: [price('a', 'B7_STANDARD', 1.99)] },
        T0,
      ),
    ).rejects.toThrow();
    expect((await repo().counts()).stations).toBe(0);
  });

  it('finds stations by distance with the spatial index', async () => {
    await repo().replaceAll(
      {
        stations: [
          station('near', { position: { lat: 54.97, lon: -2.1 } }),
          station('also-near', { position: { lat: 54.98, lon: -2.09 } }),
          station('far', { position: { lat: 51.5, lon: -0.12 } }),
        ],
        prices: [],
      },
      T0,
    );
    const { rows } = await pool.query<{ id: string }>(
      `select id from fuelprices.stations
       where ST_DWithin(location, ST_SetSRID(ST_MakePoint(-2.1, 54.97), 4326)::geography, 5000)
       order by id`,
    );
    expect(rows.map((r) => r.id)).toEqual(['also-near', 'near']);
  });

  it('can be written and read by the app role core runs as, not only by the owner', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role wagonwise_app');
      await client.query(
        `insert into fuelprices.stations (id, name, location, is_motorway, is_supermarket, closed)
         values ('x', 'X', ST_SetSRID(ST_MakePoint(-2.1, 54.97), 4326)::geography, false, false, false)`,
      );
      await client.query(
        `insert into fuelprices.prices (station_id, fuel_type, pence_per_litre, updated_at)
         values ('x', 'B7_STANDARD', 198.9, now())`,
      );
      await client.query(
        `insert into fuelprices.refreshes (refreshed_at, stations, prices) values (now(), 1, 1)`,
      );
      const read = await client.query<{ n: number }>(
        'select count(*)::int as n from fuelprices.prices',
      );
      expect(read.rows[0]?.n).toBe(1);
      await client.query('delete from fuelprices.stations');
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
