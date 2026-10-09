import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachPoolErrorHandler } from '../db.js';
import { runMigrations } from './run-migrations.js';

const migrationsDir = fileURLToPath(new URL('../../../migrations', import.meta.url));
const COMPANY = '11111111-1111-4111-8111-111111111111';

/**
 * Migration 0050 gives the new `manage_maintenance` privilege to everyone who could already look after the fleet, so
 * that no manager loses the ability to book vehicles in. This builds a database as it stood at migration 0049, with
 * real accounts in it, applies 0050, and checks who got it.
 */
describe('migration 0050: who gets manage_maintenance', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  const account = (id: string, email: string, privileges: string[], kind = 'fleet') =>
    pool.query(
      `insert into companies.staff_accounts
         (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1, $2, $3, $4, $4, $5::jsonb, now(), 'x', 'email')`,
      [id, kind, kind === 'fleet' ? COMPANY : null, email, JSON.stringify(privileges)],
    );
  const invite = (id: string, email: string, privileges: string[]) =>
    pool.query(
      `insert into companies.staff_invites
         (id, kind, company_id, email, name, privileges, token_hash, created_at, expires_at)
       values ($1, 'fleet', $2, $3, $3, $4::jsonb, $5, now(), now() + interval '1 day')`,
      [id, COMPANY, email, JSON.stringify(privileges), `token-${id}`],
    );
  const privilegesOf = async (table: 'staff_accounts' | 'staff_invites', email: string) =>
    (
      await pool.query<{ privileges: string[] }>(
        `select privileges from companies.${table} where email = $1`,
        [email],
      )
    ).rows[0]?.privileges;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(pool, () => undefined);

    // The database as it was before 0050.
    const before = mkdtempSync(join(tmpdir(), 'migrations-before-0050-'));
    for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
      if (file < '0050') copyFileSync(join(migrationsDir, file), join(before, file));
    }
    await runMigrations(pool, before);

    await pool.query(
      `insert into companies.companies (id, name, created_at) values ($1, 'Acme', now())`,
      [COMPANY],
    );
    await account('a0000000-0000-4000-8000-000000000001', 'manager@x.test', ['manage_users']);
    await account('a0000000-0000-4000-8000-000000000002', 'fleet@x.test', [
      'manage_fleet',
      'dispatch',
    ]);
    await account('a0000000-0000-4000-8000-000000000003', 'dispatcher@x.test', [
      'dispatch',
      'view_live_map',
    ]);
    await account('a0000000-0000-4000-8000-000000000004', 'viewer@x.test', ['view_reports']);
    await account('a0000000-0000-4000-8000-000000000005', 'has@x.test', [
      'manage_users',
      'manage_maintenance',
    ]);
    await account('a0000000-0000-4000-8000-000000000006', 'platform@x.test', [], 'platform');
    await invite('b0000000-0000-4000-8000-000000000001', 'newfleet@x.test', ['manage_fleet']);
    await invite('b0000000-0000-4000-8000-000000000002', 'newdispatch@x.test', ['dispatch']);

    await runMigrations(pool, migrationsDir); // applies 0050 (and anything after it)
  }, 180_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('gives it to managers and fleet managers, so nobody who could look after the fleet loses the ability', async () => {
    expect(await privilegesOf('staff_accounts', 'manager@x.test')).toEqual([
      'manage_users',
      'manage_maintenance',
    ]);
    expect(await privilegesOf('staff_accounts', 'fleet@x.test')).toEqual([
      'manage_fleet',
      'dispatch',
      'manage_maintenance',
    ]);
  });

  it('leaves dispatchers and viewers alone: it is for whoever the manager chooses to give it to', async () => {
    expect(await privilegesOf('staff_accounts', 'dispatcher@x.test')).toEqual([
      'dispatch',
      'view_live_map',
    ]);
    expect(await privilegesOf('staff_accounts', 'viewer@x.test')).toEqual(['view_reports']);
  });

  it('does not add it twice, and does not touch WagonWise staff', async () => {
    expect(await privilegesOf('staff_accounts', 'has@x.test')).toEqual([
      'manage_users',
      'manage_maintenance',
    ]);
    expect(await privilegesOf('staff_accounts', 'platform@x.test')).toEqual([]);
  });

  it('does the same for invitations not yet accepted', async () => {
    expect(await privilegesOf('staff_invites', 'newfleet@x.test')).toEqual([
      'manage_fleet',
      'manage_maintenance',
    ]);
    expect(await privilegesOf('staff_invites', 'newdispatch@x.test')).toEqual(['dispatch']);
  });
});
