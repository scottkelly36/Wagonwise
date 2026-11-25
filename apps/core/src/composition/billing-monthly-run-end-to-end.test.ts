import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBillingModule, type BillingModule } from '../modules/billing/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { makeId } from '../shared/brand.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const TRIAL = '33333333-3333-4333-8333-333333333333';

/**
 * The monthly run on real Postgres as the unprivileged app role (real Row-Level Security): from the 2nd it drafts last month once, with no
 * staff member as the creator, leaves a firm whose trial covers the month alone, records the month so a second run does nothing, and tells
 * the owner. The migration seeds the month before the one it runs in as already done; the test clears that so it does not depend on today.
 */
describe('the monthly invoice run (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let billing: BillingModule;
  const clock = new FakeClock('2026-12-01T10:00:00.000Z');
  const told: { subject: string; text: string }[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined);
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });
    // The migration marks last month (from today's date) as done: clear it so the test sets its own.
    await ownerPool.query(`delete from billing.draft_runs`);
    billing = createBillingModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      companies: {
        list: () =>
          Promise.resolve([
            { id: makeId<'CompanyId'>(ACME), name: 'Acme Freight', trialEndsOn: null },
            { id: makeId<'CompanyId'>(BETA), name: 'Beta Haulage', trialEndsOn: '2026-09-01' },
            { id: makeId<'CompanyId'>(TRIAL), name: 'Trial Firm', trialEndsOn: '2026-11-20' },
          ]),
      },
      vehicles: { countFor: () => Promise.resolve(0) },
      vehicleUse: {
        usedBetween: (companyId) =>
          Promise.resolve(
            Array.from({ length: companyId === ACME ? 3 : 1 }, (_, i) => ({
              vehicleId: `${companyId}-${i}`,
              firstDay: '2026-01-01',
              usedInMonth: true,
            })),
          ),
      },
      tellOwner: (subject, text) => {
        told.push({ subject, text });
        return Promise.resolve();
      },
      portalAddress: 'https://dashboard.example.test',
    });
  }, 120_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  it('does nothing on the 1st of the month', async () => {
    expect(await billing.draftLastMonth()).toEqual({ ran: false, reason: 'too_early' });
    const { rows } = await ownerPool.query(`select 1 from billing.invoices`);
    expect(rows).toHaveLength(0);
  });

  it('on the 2nd drafts last month once, by itself, leaving a trial firm alone, and tells the owner', async () => {
    clock.set('2026-12-02T10:00:00.000Z');
    const outcome = await billing.draftLastMonth();
    expect(outcome).toMatchObject({ ran: true, month: '2026-11', totalPence: 4000, onTrial: 1 });

    const drafts = await ownerPool.query<{
      company_name: string;
      created_by: string | null;
      status: string;
    }>(
      `select company_name, created_by, status from billing.invoices where month = '2026-11' order by company_name`,
    );
    expect(drafts.rows).toEqual([
      { company_name: 'Acme Freight', created_by: null, status: 'draft' },
      { company_name: 'Beta Haulage', created_by: null, status: 'draft' },
    ]);
    const run = await ownerPool.query(
      `select drafts, total_pence from billing.draft_runs where month = '2026-11'`,
    );
    expect(run.rows[0]).toEqual({ drafts: 2, total_pence: '4000' });

    expect(told).toHaveLength(1);
    expect(told[0]?.subject).toBe('Invoices for November 2026: 2 drafts, £40.00');
    expect(told[0]?.text).toContain('https://dashboard.example.test/admin/invoices');
    // The seeded billing details still hold brackets, and the owner is told to fill them in before issuing.
    expect(told[0]?.text).toContain('[brackets]');
  });

  it('does not do the month twice, and a draft deleted on purpose stays deleted', async () => {
    await ownerPool.query(
      `delete from billing.invoices where company_name = 'Beta Haulage' and month = '2026-11'`,
    );
    expect(await billing.draftLastMonth()).toEqual({ ran: false, reason: 'already_done' });
    const { rows } = await ownerPool.query(
      `select company_name from billing.invoices where month = '2026-11'`,
    );
    expect(rows).toEqual([{ company_name: 'Acme Freight' }]);
    expect(told).toHaveLength(1);
  });

  it('drafts the next month when it comes, and bills the trial firm now its trial has ended', async () => {
    clock.set('2027-01-03T10:00:00.000Z');
    const outcome = await billing.draftLastMonth();
    expect(outcome).toMatchObject({ ran: true, month: '2026-12', onTrial: 0 });
    const { rows } = await ownerPool.query<{ company_name: string }>(
      `select company_name from billing.invoices where month = '2026-12' order by company_name`,
    );
    expect(rows.map((r) => r.company_name)).toEqual(['Acme Freight', 'Beta Haulage', 'Trial Firm']);
  });
});
