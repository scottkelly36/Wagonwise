import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompaniesModule, type CompaniesModule } from '../modules/companies/api.js';
import { createBillingModule, type BillingModule } from '../modules/billing/api.js';
import { createSignupsModule } from '../modules/signups/api.js';
import { TRIAL_VEHICLES, trialFirmStarter } from './trial-firm.js';
import { registerStaffAuth } from '../host/staff-auth.js';
import { registerErrorHandling } from '../host/error-handler.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '80000000-0000-4000-8000-000000000001';
const BOSS = '80000000-0000-4000-8000-000000000002';

/**
 * "Start a trial" on a firm that registered on the website, on real Postgres with the real signups and companies modules: one press
 * makes the company on a free trial and invites its first person as manager, notes it on the sign-up, and cannot be done twice.
 * Only WagonWise staff can press it; a driver's sign-up is not a firm; an address that already has an account is refused before
 * any company is made.
 */
describe('start a trial from a website sign-up (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let scopes: PostgresDataScopes;
  let ownerPool: Pool;
  let appPool: Pool;
  let companies: CompaniesModule;
  let billing: BillingModule;
  let app: FastifyInstance;
  const emails: { to: string; subject: string; text: string }[] = [];
  let failEmails = false;

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
    scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });
    const clock = new FakeClock('2026-11-24T12:00:00.000Z');
    const ids = new UuidIdGenerator();

    await ownerPool.query(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1,'platform',null,'admin@wagonwise.com','Admin','[]',now(),'x','email')`,
      [ADMIN],
    );

    companies = createCompaniesModule({
      db,
      clock,
      ids,
      dataScopes: scopes,
      dashboardUrl: 'https://dashboard.example.test',
      identity: {
        sendOneTimeCode: () => Promise.resolve(),
        sendEmail: (to: string, subject: string, text: string) => {
          if (failEmails) return Promise.reject(new Error('mail down'));
          emails.push({ to, subject, text });
          return Promise.resolve();
        },
        signStaffAccessToken: () => Promise.resolve({ token: 't', expiresAt: new Date() }),
      } as never,
    });
    billing = createBillingModule({
      db,
      clock,
      ids,
      dataScopes: scopes,
      callers: { getCaller: (id) => companies.getStaffCaller(id) },
      companies: { list: () => Promise.resolve([]) },
      vehicles: { countFor: () => Promise.resolve(0) },
      vehicleUse: { usedBetween: () => Promise.resolve([]) },
    });
    const signups = createSignupsModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => companies.getStaffCaller(id) },
      invites: { newInviteCode: () => Promise.resolve('X'), sendEmail: () => Promise.resolve() },
      firms: trialFirmStarter(companies, billing),
    });

    app = Fastify();
    registerErrorHandling(app);
    registerStaffAuth(
      app,
      { verify: (token) => Promise.resolve({ staffId: token, sessionId: 'session' }) },
      (staffId, method, path) => companies.isStaffRequestRefused(staffId, method, path),
    );
    companies.registerRoutes(app);
    signups.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (staffId: string) => ({ headers: { authorization: `Bearer ${staffId}` } });
  const register = (email: string, role: string, company?: string) =>
    app.inject({
      method: 'POST',
      url: '/signups',
      payload: {
        email,
        name: 'Sam Smith',
        role,
        ...(company === undefined ? {} : { company }),
        consent: true,
      },
    });
  const testerId = async (email: string) =>
    (
      await ownerPool.query<{ id: string }>(`select id from signups.testers where email = $1`, [
        email,
      ])
    ).rows[0]?.id as string;
  const start = (id: string, payload: object, staffId = ADMIN) =>
    app.inject({
      method: 'POST',
      url: `/staff/signups/${id}/start-trial`,
      payload,
      ...as(staffId),
    });

  it('makes the company on a free trial, invites the person as its manager, and notes it on the sign-up', async () => {
    await register('sam@acmehaulage.com', 'company', 'Acme Haulage');
    const id = await testerId('sam@acmehaulage.com');
    const response = await start(id, { firmName: 'Acme Haulage Ltd' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; companyId: string; emailed: boolean }>();
    expect(body).toMatchObject({ status: 'started', emailed: true, vehicles: TRIAL_VEHICLES });
    expect(body).not.toHaveProperty('inviteToken');

    const company = await ownerPool.query<{
      name: string;
      status: string;
      trial_ends_on: string | null;
    }>(
      `select name, account_status as status, trial_ends_on::text as trial_ends_on from companies.companies where id = $1`,
      [body.companyId],
    );
    expect(company.rows[0]).toMatchObject({ name: 'Acme Haulage Ltd', status: 'trial' });
    expect(company.rows[0]?.trial_ends_on).not.toBeNull();

    // The plan has room for the firm's first vehicles: a company with no plan covers none, and fleet refuses its first.
    expect(
      await scopes.run({ kind: 'platform' }, () => billing.vehicleCapacityFor(body.companyId)),
    ).toBe(TRIAL_VEHICLES);

    const invite = await ownerPool.query<{
      email: string;
      name: string;
      privileges: string[];
      kind: string;
    }>(`select email, name, privileges, kind from companies.staff_invites where company_id = $1`, [
      body.companyId,
    ]);
    expect(invite.rows).toHaveLength(1);
    expect(invite.rows[0]).toMatchObject({
      email: 'sam@acmehaulage.com',
      name: 'Sam Smith',
      kind: 'fleet',
    });
    expect(invite.rows[0]?.privileges).toContain('manage_users');
    expect(emails.at(-1)?.to).toBe('sam@acmehaulage.com');
    expect(emails.at(-1)?.text).toContain('https://dashboard.example.test/join?token=');

    const noted = await ownerPool.query<{ trial_company_id: string; trial_started_at: Date }>(
      `select trial_company_id, trial_started_at from signups.testers where id = $1`,
      [id],
    );
    expect(noted.rows[0]?.trial_company_id).toBe(body.companyId);
    expect(noted.rows[0]?.trial_started_at).not.toBeNull();

    const list = await app.inject({ method: 'GET', url: '/staff/signups', ...as(ADMIN) });
    expect(
      list.json<{ testers: { email: string; trialStartedAt?: string }[] }>().testers[0],
    ).toMatchObject({
      email: 'sam@acmehaulage.com',
      trialStartedAt: '2026-11-24T12:00:00.000Z',
    });
  });

  it('will not make a second firm from the same sign-up', async () => {
    const before = (await ownerPool.query(`select count(*)::int as n from companies.companies`))
      .rows[0] as { n: number };
    const again = await start(await testerId('sam@acmehaulage.com'), {
      firmName: 'Acme Haulage Ltd',
    });
    expect(again.json<{ status: string }>().status).toBe('already_started');
    const after = (await ownerPool.query(`select count(*)::int as n from companies.companies`))
      .rows[0] as { n: number };
    expect(after.n).toBe(before.n);
  });

  it('is for WagonWise staff only', async () => {
    await register('lee@betafreight.com', 'company', 'Beta Freight');
    await ownerPool.query(
      `insert into companies.companies (id, name, created_at) values ('81000000-0000-4000-8000-000000000001','Other',now())`,
    );
    await ownerPool.query(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1,'fleet','81000000-0000-4000-8000-000000000001','boss@otherfirm.com','Boss','["manage_users"]',now(),'x','email')`,
      [BOSS],
    );
    const refused = await start(
      await testerId('lee@betafreight.com'),
      { firmName: 'Beta Freight' },
      BOSS,
    );
    expect(refused.statusCode).toBe(403);
    expect(
      (await ownerPool.query(`select 1 from companies.companies where name = 'Beta Freight'`))
        .rowCount,
    ).toBe(0);
  });

  it('says a driver is not a firm, and makes nothing', async () => {
    await register('dan@driver.com', 'driver');
    const response = await start(await testerId('dan@driver.com'), { firmName: 'Dan' });
    expect(response.json<{ status: string }>().status).toBe('not_a_firm');
    expect(
      (await ownerPool.query(`select 1 from companies.companies where name = 'Dan'`)).rowCount,
    ).toBe(0);
  });

  it('refuses an address that already has an account before any company is made', async () => {
    await register('admin@wagonwise.com', 'company', 'Same Address Ltd');
    const response = await start(await testerId('admin@wagonwise.com'), {
      firmName: 'Same Address Ltd',
    });
    expect(response.json<{ status: string }>().status).toBe('email_in_use');
    expect(
      (await ownerPool.query(`select 1 from companies.companies where name = 'Same Address Ltd'`))
        .rowCount,
    ).toBe(0);
  });

  it('keeps the firm and hands over the link when the email cannot be sent', async () => {
    await register('kim@gammahaulage.com', 'both', 'Gamma Haulage');
    failEmails = true;
    const response = await start(await testerId('kim@gammahaulage.com'), {
      firmName: 'Gamma Haulage',
    });
    failEmails = false;
    const body = response.json<{ status: string; emailed: boolean; inviteToken?: string }>();
    expect(body).toMatchObject({ status: 'started', emailed: false });
    expect(typeof body.inviteToken).toBe('string');
    expect(
      (await ownerPool.query(`select 1 from companies.companies where name = 'Gamma Haulage'`))
        .rowCount,
    ).toBe(1);
  });

  it('refuses a missing firm name', async () => {
    await register('zed@deltahaulage.com', 'company');
    const response = await start(await testerId('zed@deltahaulage.com'), { firmName: '   ' });
    expect(response.statusCode).toBe(400);
  });
});
