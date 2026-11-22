import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompaniesModule, type CompaniesModule } from '../modules/companies/api.js';
import { registerStaffAuth } from '../host/staff-auth.js';
import { registerErrorHandling } from '../host/error-handler.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '70000000-0000-4000-8000-000000000001';
const ACME_MANAGER = '70000000-0000-4000-8000-000000000002';
const BETA_MANAGER = '70000000-0000-4000-8000-000000000003';
const ACME = '71000000-0000-4000-8000-000000000001';
const BETA = '71000000-0000-4000-8000-000000000002';
const NEW_FIRM = '71000000-0000-4000-8000-000000000003';

/**
 * A paused company on real Postgres, with the real staff-auth hook and the real companies module (docs/company-account-states-scope.md):
 * its staff can still read and see the banner's state, but every change is refused with `account_paused`; WagonWise staff are never
 * held back; another company is untouched; and the move back to active takes effect again. The tokens are the test's own (the
 * real token signing has its own tests); everything after them is real.
 */
describe('company account states end to end (real RLS, real hook)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let companies: CompaniesModule;
  let app: FastifyInstance;
  // A clock in the future of the gate's cache, so a state change is seen on the next request.
  const clock = new FakeClock('2026-11-22T12:00:00.000Z');

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

    const q = (text: string, values: unknown[] = []) => ownerPool.query(text, values);
    // Two companies that were there before account states existed: the migration leaves them 'active'.
    await q(
      `insert into companies.companies (id, name, created_at) values ($1,'Acme Haulage',now()),($2,'Beta Freight',now())`,
      [ACME, BETA],
    );
    await q(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1,'platform',null,'admin@wagonwise.test','Admin','[]',now(),'x','email'),
              ($2,'fleet',$4,'boss@acme.test','Acme Boss','["manage_users","manage_fleet"]',now(),'x','email'),
              ($3,'fleet',$5,'boss@beta.test','Beta Boss','["manage_users","manage_fleet"]',now(),'x','email')`,
      [ADMIN, ACME_MANAGER, BETA_MANAGER, ACME, BETA],
    );

    companies = createCompaniesModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      identity: {
        sendOneTimeCode: () => Promise.resolve(),
        sendEmail: () => Promise.resolve(),
        signStaffAccessToken: () => Promise.resolve({ token: 't', expiresAt: new Date() }),
      } as never,
    });

    app = Fastify();
    registerErrorHandling(app);
    // The token is the staff id: the test's stand-in for the signed token. The rest of the hook is the real one.
    registerStaffAuth(
      app,
      { verify: (token) => Promise.resolve({ staffId: token, sessionId: 'session' }) },
      (staffId, method, path) => companies.isStaffRequestRefused(staffId, method, path),
    );
    companies.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (staffId: string) => ({ headers: { authorization: `Bearer ${staffId}` } });
  const setState = (staffId: string, company: string, payload: object) =>
    app.inject({
      method: 'PUT',
      url: `/staff/companies/${company}/account-state`,
      payload,
      ...as(staffId),
    });
  const changeSettings = (staffId: string, company: string) =>
    app.inject({
      method: 'PUT',
      url: `/staff/companies/${company}/settings`,
      payload: { photoRetentionMonths: 6 },
      ...as(staffId),
    });
  const advance = () => clock.advance(10_000); // past the gate's few seconds of memory

  it('leaves the companies that already existed active, and a new one on a three month trial', async () => {
    const list = await app.inject({ method: 'GET', url: '/staff/companies', ...as(ADMIN) });
    expect(list.statusCode).toBe(200);
    const byName = Object.fromEntries(
      list
        .json<{
          companies: { name: string; accountStatus: string; trialEndsOn: string | null }[];
        }>()
        .companies.map((c) => [c.name, c]),
    );
    expect(byName['Acme Haulage']).toMatchObject({ accountStatus: 'active', trialEndsOn: null });

    const created = await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id: NEW_FIRM, name: 'New Firm Ltd' },
      ...as(ADMIN),
    });
    expect(created.statusCode).toBe(201);
    const state = await app.inject({
      method: 'GET',
      url: `/staff/companies/${NEW_FIRM}/account-state`,
      ...as(ADMIN),
    });
    // The clock is 22 November 2026, so 90 days on is 20 February 2027.
    expect(state.json()).toMatchObject({ status: 'trial', trialEndsOn: '2027-02-20', hold: false });
  });

  it('lets an active company change its settings', async () => {
    expect((await changeSettings(ACME_MANAGER, ACME)).statusCode).toBe(200);
  });

  it('refuses a paused company every change, with account_paused', async () => {
    const paused = await setState(ADMIN, ACME, { status: 'paused', note: 'no payment details' });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({ status: 'paused', note: 'no payment details' });
    advance();

    const refused = await changeSettings(ACME_MANAGER, ACME);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'account_paused' });
    // Nothing was changed: the setting is still what it was.
    const read = await app.inject({
      method: 'GET',
      url: `/staff/companies/${ACME}/settings`,
      ...as(ACME_MANAGER),
    });
    expect(read.json()).toEqual({ photoRetentionMonths: 6 });
  });

  it('lets a paused company read, and shows its own staff the status but not the owner notes', async () => {
    const own = await app.inject({
      method: 'GET',
      url: '/staff/company/account-state',
      ...as(ACME_MANAGER),
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ companyId: ACME, status: 'paused' });
    expect(own.json()).not.toHaveProperty('note');
    expect(own.json()).not.toHaveProperty('hold');
  });

  it('does not let a paused company un-pause itself, or move anyone else', async () => {
    const self = await setState(ACME_MANAGER, ACME, { status: 'active', note: '' });
    expect(self.statusCode).toBe(403);
    expect(self.json()).toMatchObject({ error: 'account_paused' });
    const other = await app.inject({
      method: 'GET',
      url: `/staff/companies/${BETA}/account-state`,
      ...as(ACME_MANAGER),
    });
    expect(other.statusCode).toBe(403);
    expect(other.json()).toMatchObject({ tag: 'Forbidden' });
  });

  it('leaves another company untouched', async () => {
    expect((await changeSettings(BETA_MANAGER, BETA)).statusCode).toBe(200);
  });

  it('never holds back WagonWise staff, even in a paused company', async () => {
    const changed = await app.inject({
      method: 'PUT',
      url: `/staff/companies/${ACME}/settings`,
      payload: { photoRetentionMonths: 24 },
      ...as(ADMIN),
    });
    expect(changed.statusCode).toBe(200);
  });

  it('logs the move, by whom, and keeps the log from a company', async () => {
    const { rows } = await ownerPool.query(
      `select from_status, to_status, by_staff_id, note from companies.account_state_log where company_id = $1`,
      [ACME],
    );
    expect(rows).toEqual([
      {
        from_status: 'active',
        to_status: 'paused',
        by_staff_id: ADMIN,
        note: 'no payment details',
      },
    ]);
    // Row-Level Security: as the app role, a company's scope sees none of the log and WagonWise staff's scope sees it.
    const count = async (settings: Record<string, string>) => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        for (const [name, value] of Object.entries(settings)) {
          await client.query('select set_config($1, $2, true)', [name, value]);
        }
        const seen = await client.query(
          'select count(*)::int as n from companies.account_state_log',
        );
        await client.query('rollback');
        return (seen.rows[0] as { n: number }).n;
      } finally {
        client.release();
      }
    };
    expect(await count({ 'app.company_id': ACME })).toBe(0);
    expect(await count({ 'app.platform_staff': 'on' })).toBeGreaterThan(0);
  });

  it('lets the company change things again once WagonWise moves it back to active', async () => {
    expect((await setState(ADMIN, ACME, { status: 'active', note: 'paid' })).statusCode).toBe(200);
    advance();
    expect((await changeSettings(ACME_MANAGER, ACME)).statusCode).toBe(200);
  });

  it('keeps the trial length setting for WagonWise staff only, and a one month trial after it is shortened', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/staff/account-settings', ...as(ACME_MANAGER) }))
        .statusCode,
    ).toBe(403);
    const set = await app.inject({
      method: 'PUT',
      url: '/staff/account-settings',
      payload: { defaultTrialDays: 30, graceDays: 14 },
      ...as(ADMIN),
    });
    expect(set.statusCode).toBe(200);
    const id = '71000000-0000-4000-8000-000000000004';
    await app.inject({
      method: 'POST',
      url: '/staff/companies',
      payload: { id, name: 'Second New Firm' },
      ...as(ADMIN),
    });
    const state = await app.inject({
      method: 'GET',
      url: `/staff/companies/${id}/account-state`,
      ...as(ADMIN),
    });
    expect(state.json()).toMatchObject({ status: 'trial', trialEndsOn: '2026-12-22' });
    // The firm made before the change keeps its three months.
    const first = await app.inject({
      method: 'GET',
      url: `/staff/companies/${NEW_FIRM}/account-state`,
      ...as(ADMIN),
    });
    expect(first.json()).toMatchObject({ trialEndsOn: '2027-02-20' });
  });
});
