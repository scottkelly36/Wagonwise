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
      '0007_feedback.sql',
      '0008_identity_devices.sql',
      '0009_route_plans_geography.sql',
      '0010_routing_restriction_overrides.sql',
      '0011_identity_driver_lifecycle.sql',
      '0012_identity_admin_flag.sql',
      '0013_congestion.sql',
      '0014_companies.sql',
      '0015_identity_company_id.sql',
      '0016_parking.sql',
      '0017_route_options.sql',
      '0018_identity_scopes.sql',
      '0019_fleet.sql',
      '0020_staff.sql',
      '0021_rls.sql',
      '0022_staff_audit.sql',
      '0023_staff_lockout_index.sql',
      '0024_staff_bootstrap_invite.sql',
      '0025_drop_driver_admin_scopes.sql',
      '0026_jobs.sql',
      '0027_jobs_one_active_per_driver.sql',
      '0028_fleet_driver_links.sql',
      '0029_drop_identity_drivers_company_id.sql',
      '0030_jobs_driver_rls.sql',
      '0031_jobs_proof_of_delivery.sql',
      '0032_jobs_positions.sql',
    ]);

    const { rows: schemas } = await pool.query<{ schema_name: string }>(
      `select schema_name from information_schema.schemata
       where schema_name in ('identity', 'routing', 'hazards', 'feedback', 'outbox', 'congestion', 'companies')
       order by schema_name`,
    );
    expect(schemas.map((row) => row.schema_name)).toEqual([
      'companies',
      'congestion',
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
      'devices',
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
      'reroute_alerts',
      'restriction_overrides',
      'route_plans',
      'vehicle_profiles',
    ]);

    const { rows: hazardsTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'hazards' order by table_name`,
    );
    expect(hazardsTables.map((row) => row.table_name)).toEqual(['reports']);

    const { rows: feedbackTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'feedback' order by table_name`,
    );
    expect(feedbackTables.map((row) => row.table_name)).toEqual(['notes']);

    const { rows: congestionTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'congestion' order by table_name`,
    );
    expect(congestionTables.map((row) => row.table_name)).toEqual(['reports']);

    const { rows: companiesTables } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'companies' order by table_name`,
    );
    expect(companiesTables.map((row) => row.table_name)).toEqual([
      'companies',
      'staff_accounts',
      'staff_audit',
      'staff_challenges',
      'staff_invites',
      'staff_recovery_codes',
      'staff_sessions',
    ]);

    // P2-M2.8: dropped in favour of fleet.driver_links, which can hold several companies.
    const { rows: driverColumns } = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'identity' and table_name = 'drivers' and column_name = 'company_id'`,
    );
    expect(driverColumns).toHaveLength(0);

    const { rows: extensions } = await pool.query<{ extname: string }>(
      "select extname from pg_extension where extname = 'postgis'",
    );
    expect(extensions).toHaveLength(1);
  }, 20_000); // Applying nine real migrations can outlast vitest's 5s default under a heavily
  // loaded machine — this suite now runs a dozen-plus Testcontainers Postgres instances
  // concurrently (M6.7 added another), and this is genuine DB work, not a hung test.

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
      '0007_feedback.sql',
      '0008_identity_devices.sql',
      '0009_route_plans_geography.sql',
      '0010_routing_restriction_overrides.sql',
      '0011_identity_driver_lifecycle.sql',
      '0012_identity_admin_flag.sql',
      '0013_congestion.sql',
      '0014_companies.sql',
      '0015_identity_company_id.sql',
      '0016_parking.sql',
      '0017_route_options.sql',
      '0018_identity_scopes.sql',
      '0019_fleet.sql',
      '0020_staff.sql',
      '0021_rls.sql',
      '0022_staff_audit.sql',
      '0023_staff_lockout_index.sql',
      '0024_staff_bootstrap_invite.sql',
      '0025_drop_driver_admin_scopes.sql',
      '0026_jobs.sql',
      '0027_jobs_one_active_per_driver.sql',
      '0028_fleet_driver_links.sql',
      '0029_drop_identity_drivers_company_id.sql',
      '0030_jobs_driver_rls.sql',
      '0031_jobs_proof_of_delivery.sql',
      '0032_jobs_positions.sql',
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
