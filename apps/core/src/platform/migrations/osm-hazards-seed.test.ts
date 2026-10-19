import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.js';

const migrationsDir = fileURLToPath(new URL('../../../migrations', import.meta.url));
const SEED = readFileSync(`${migrationsDir}/0072_seed_osm_hazards.sql`, 'utf8');

/**
 * Migration 0072 on real Postgres: the OpenStreetMap starting set of hazards is in, every row is a measured, permanent, active
 * low bridge or weight limit that belongs to the one import reporter, none is inserted twice, and running the seed again
 * changes nothing. The hazards are in Great Britain, with plausible limits.
 */
describe('migration 0072: OpenStreetMap hazards', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool, migrationsDir);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const count = async (where = 'true'): Promise<number> =>
    Number(
      (
        await pool.query<{ n: string }>(
          `select count(*) as n from hazards.reports where source = 'osm' and ${where}`,
        )
      ).rows[0]?.n,
    );

  it('adds a few thousand low bridges and weight limits, each with its OpenStreetMap id', async () => {
    expect(await count()).toBeGreaterThan(1000);
    expect(await count("type = 'low_bridge'")).toBeGreaterThan(500);
    expect(await count("type = 'weight_limit'")).toBeGreaterThan(100);
    expect(await count("type not in ('low_bridge', 'weight_limit')")).toBe(0);
    expect(await count('osm_id is null')).toBe(0);
    const distinct = await pool.query<{ n: string }>(
      `select count(distinct osm_id) as n from hazards.reports where source = 'osm'`,
    );
    expect(Number(distinct.rows[0]?.n)).toBe(await count());
  });

  it('makes every one a measured, permanent, active hazard of the import reporter', async () => {
    expect(await count('measurement_value is null')).toBe(0);
    expect(await count("status <> 'active'")).toBe(0);
    expect(await count('expires_at is not null')).toBe(0);
    expect(await count("reporter_id <> '00000000-0000-4000-8000-0000000005a1'")).toBe(0);
    expect(
      await count(
        "type = 'low_bridge' and (measurement_kind <> 'height' or measurement_unit <> 'm')",
      ),
    ).toBe(0);
    expect(
      await count(
        "type = 'weight_limit' and (measurement_kind <> 'weight' or measurement_unit <> 't')",
      ),
    ).toBe(0);
    expect(await count('confirmations <> 0 or dismissals <> 0')).toBe(0);
  });

  it('keeps limits in a plausible range and every place in Great Britain', async () => {
    expect(
      await count("type = 'low_bridge' and (measurement_value < 3 or measurement_value > 5)"),
    ).toBe(0);
    expect(
      await count("type = 'weight_limit' and (measurement_value < 3 or measurement_value > 40)"),
    ).toBe(0);
    expect(
      await count(`not ST_Intersects(location, ST_MakeEnvelope(-9, 49.8, 2, 61, 4326)::geography)`),
    ).toBe(0);
    // Not the Republic of Ireland's side of the Irish Sea, and not France.
    expect(await count('ST_Y(location::geometry) < 50 and ST_X(location::geometry) > 1.5')).toBe(0);
  });

  it('is safe to run again: no row is added twice', async () => {
    const before = await count();
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    try {
      await client.query(SEED);
    } finally {
      await client.end();
    }
    expect(await count()).toBe(before);
  });
});
