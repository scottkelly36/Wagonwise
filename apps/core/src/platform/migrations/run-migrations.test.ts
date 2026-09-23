import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.js';

const migrationsDir = fileURLToPath(new URL('../../../migrations', import.meta.url));

/**
 * Real Postgres/PostGIS via Testcontainers, not a mock — this is the check that would have
 * caught the M1.2-era "fails open" defects if it had existed then. One container for the whole
 * file: migrations are cheap enough that per-test containers would only slow the suite down.
 */
describe('runMigrations', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('applies every migration in order: schemas, outbox tables, PostGIS, identity/routing tables', async () => {
    const result = await runMigrations(pool, migrationsDir);
    expect(result.applied).toEqual([
      '0001_init.sql',
      '0002_identity.sql',
      '0003_routing.sql',
      '0004_route_plans.sql',
      '0005_hazards.sql',
      '0006_active_trips.sql',
    ]);

    const { rows: schemas } = await pool.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata
       where schema_name in ('identity', 'routing', 'hazards', 'feedback', 'outbox')
       order by schema_name`,
    );
    expect(schemas.map((row) => row.schema_name)).toEqual([
      'feedback',
      'hazards',
      'identity',
      'outbox',
      'routing',
    ]);

    const { rows: outboxTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'outbox' order by table_name`,
    );
    expect(outboxTables.map((row) => row.table_name)).toEqual(['events', 'handled']);

    const { rows: identityTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'identity' order by table_name`,
    );
    expect(identityTables.map((row) => row.table_name)).toEqual([
      'drivers',
      'invite_codes',
      'otp_codes',
      'sessions',
    ]);

    const { rows: routingTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'routing' order by table_name`,
    );
    expect(routingTables.map((row) => row.table_name)).toEqual([
      'active_trips',
      'route_plans',
      'vehicle_profiles',
    ]);

    const { rows: hazardsTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'hazards' order by table_name`,
    );
    expect(hazardsTables.map((row) => row.table_name)).toEqual(['reports']);

    const { rows: extensions } = await pool.query<{ extname: string }>(
      "select extname from pg_extension where extname = 'postgis'",
    );
    expect(extensions).toHaveLength(1);
  });

  it('is idempotent: re-running once everything is applied does nothing', async () => {
    const first = await runMigrations(pool, migrationsDir);
    expect(first.applied).toEqual([]); // already applied by the previous test

    const second = await runMigrations(pool, migrationsDir);
    expect(second.applied).toEqual([]);
  });

  it('records every applied migration in public.schema_migrations', async () => {
    const { rows } = await pool.query<{ id: string }>(
      'select id from public.schema_migrations order by id',
    );
    expect(rows.map((row) => row.id)).toEqual([
      '0001_init.sql',
      '0002_identity.sql',
      '0003_routing.sql',
      '0004_route_plans.sql',
      '0005_hazards.sql',
      '0006_active_trips.sql',
    ]);
  });
});

describe('runMigrations: a failing migration', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('rolls back a bad file entirely and leaves it unrecorded, so a fix can re-run it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wagonwise-bad-migration-'));
    writeFileSync(
      join(dir, '0001_bad.sql'),
      'create table public.should_not_exist (id int); select 1 / 0;',
    );

    await expect(runMigrations(pool, dir)).rejects.toThrow(/0001_bad\.sql failed, rolled back/);

    const { rows: applied } = await pool.query('select id from public.schema_migrations');
    expect(applied).toEqual([]);

    const { rows: leaked } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_name = 'should_not_exist'`,
    );
    expect(leaked).toEqual([]); // the whole file's DDL rolled back, not just the failing statement
  });
});
