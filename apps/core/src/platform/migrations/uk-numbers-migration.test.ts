import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './run-migrations.js';

const migrationsDir = fileURLToPath(new URL('../../../migrations', import.meta.url));
const MIGRATION = readFileSync(`${migrationsDir}/0065_uk_numbers_one_form.sql`, 'utf8');

const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACME = '71000000-0000-4000-8000-000000000001';

/**
 * Migration 0065 on real Postgres: UK numbers stored as typed are rewritten +44…, anything that would clash with another row is left
 * alone, and emails and numbers outside the UK are never touched. The migration has already run (on empty tables) when the schema is
 * built, so the rows are made afterwards and its text is run again, as a fresh session since it creates a temporary function.
 */
describe('migration 0065: UK numbers in one form', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool, migrationsDir);
    await pool.query(
      `insert into companies.companies (id, name, created_at) values ($1, 'Acme', now())`,
      [ACME],
    );
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  async function runAgain(): Promise<void> {
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    try {
      await client.query(MIGRATION);
    } finally {
      await client.end();
    }
  }

  const driver = (n: number, identifier: string) =>
    pool.query(`insert into identity.drivers (id, identifier) values ($1, $2)`, [
      id(n),
      identifier,
    ]);
  const stored = async () =>
    (
      await pool.query<{ id: string; identifier: string }>(
        `select id, identifier from identity.drivers`,
      )
    ).rows.reduce<Record<string, string>>((all, row) => ({ ...all, [row.id]: row.identifier }), {});

  it('rewrites every way of writing a UK number, and leaves emails, other countries and clashes alone', async () => {
    await driver(1, '07700900123'); // national
    await driver(2, '447700900124'); // no plus
    await driver(3, '+447700900125'); // already right
    await driver(4, '00447700900126'); // 00 prefix
    await driver(5, 'sam@example.com');
    await driver(6, '+353871234567'); // Ireland
    // The same person twice, already: one as typed, one the right way. Neither is changed, nothing is merged.
    await driver(7, '07700900127');
    await driver(8, '+447700900127');
    // Two odd forms of one number, neither the right one: rewriting both would clash, so neither is changed.
    await driver(9, '07700900128');
    await driver(10, '447700900128');

    await runAgain();
    const now = await stored();
    expect(now[id(1)]).toBe('+447700900123');
    expect(now[id(2)]).toBe('+447700900124');
    expect(now[id(3)]).toBe('+447700900125');
    expect(now[id(4)]).toBe('+447700900126');
    expect(now[id(5)]).toBe('sam@example.com');
    expect(now[id(6)]).toBe('+353871234567');
    expect(now[id(7)]).toBe('07700900127');
    expect(now[id(8)]).toBe('+447700900127');
    expect(now[id(9)]).toBe('07700900128');
    expect(now[id(10)]).toBe('447700900128');
  });

  it('does the same for the numbers firms have invited, within a company and status', async () => {
    const invite = (n: number, identifier: string, status = 'invited') =>
      pool.query(
        `insert into fleet.driver_links (id, company_id, invited_identifier, status, created_at) values ($1, $2, $3, $4, now())`,
        [id(100 + n), ACME, identifier, status],
      );
    await invite(1, '07700900200');
    await invite(2, 'pat@example.com');
    await invite(3, '07700900201');
    await invite(4, '+447700900201', 'declined'); // a different status: no clash with the invitation above
    await runAgain();
    const rows = (
      await pool.query<{ id: string; invited_identifier: string }>(
        `select id, invited_identifier from fleet.driver_links where invited_identifier is not null`,
      )
    ).rows.reduce<Record<string, string>>(
      (all, r) => ({ ...all, [r.id]: r.invited_identifier }),
      {},
    );
    expect(rows[id(101)]).toBe('+447700900200');
    expect(rows[id(102)]).toBe('pat@example.com');
    expect(rows[id(103)]).toBe('+447700900201');
    expect(rows[id(104)]).toBe('+447700900201');
  });

  it('can be run twice with the same result', async () => {
    const before = await stored();
    await runAgain();
    expect(await stored()).toEqual(before);
  });
});
