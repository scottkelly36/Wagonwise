import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const THIS = '0028_fleet_driver_links.sql';

const ACME = '11111111-1111-4111-8111-111111111111';
const WITH_COMPANY = 'd1000000-0000-4000-8000-000000000001';
const NO_COMPANY = 'd2000000-0000-4000-8000-000000000002';

/**
 * 0028 is the first migration that moves live data: drivers an admin already assigned to a company
 * must keep working. The ordinary migration test runs it on an empty database, so this one stops
 * just before it, adds drivers the way production has them, then runs it.
 */
describe('migration 0028 backfills driver links from drivers.company_id', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files.filter((f) => f < THIS)) {
      await pool.query(readFileSync(`${migrationsDir}/${file}`, 'utf8'));
    }
    await pool.query(
      `insert into identity.drivers (id, identifier, company_id)
         values ('${WITH_COMPANY}', 'with@example.com', '${ACME}'),
                ('${NO_COMPANY}', 'without@example.com', null)`,
    );
    await pool.query(readFileSync(`${migrationsDir}/${THIS}`, 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('gives each assigned driver one active link, and nobody else a link', async () => {
    const { rows } = await pool.query<{ company_id: string; driver_id: string; status: string }>(
      'select company_id, driver_id, status from fleet.driver_links',
    );
    expect(rows).toEqual([{ company_id: ACME, driver_id: WITH_COMPANY, status: 'active' }]);
  });

  it('leaves drivers.company_id in place for the jobs lookup until the cut-over', async () => {
    const { rows } = await pool.query<{ company_id: string | null }>(
      `select company_id from identity.drivers where id = '${WITH_COMPANY}'`,
    );
    expect(rows[0]?.company_id).toBe(ACME);
  });
});
