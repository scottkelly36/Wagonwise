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

/**
 * A firm that registers on the website starts its own trial from the link it is emailed, with no one at WagonWise pressing a button: on
 * real Postgres with the real signups, companies and billing modules, through the real routes. The two trial routes take no sign-in.
 */
describe('a firm starts its own trial from the emailed link (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let companies: CompaniesModule;
  let billing: BillingModule;
  const clock = new FakeClock('2026-11-25T12:00:00.000Z');
  /** Emails to the person who registered (the link), to the owner, and the invitation the new company sends. */
  const toRegistrant: { to: string; text: string }[] = [];
  const toOwner: { subject: string; text: string }[] = [];
  const invitations: { to: string; text: string }[] = [];

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
        sendEmail: (to: string, _subject: string, text: string) => {
          invitations.push({ to, text });
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
      notify: {
        toOwner: (subject, text) => {
          toOwner.push({ subject, text });
          return Promise.resolve();
        },
        toRegistrant: (to, _subject, text) => {
          toRegistrant.push({ to, text });
          return Promise.resolve();
        },
        portalAddress: 'https://dashboard.example.test',
      },
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

  const register = (email: string, role = 'company', company?: string) =>
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
  /** The emails are sent without anyone waiting for them, so give them a moment to be recorded. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  const tokenFor = async (email: string): Promise<string> => {
    await settle();
    const text = [...toRegistrant].reverse().find((m) => m.to === email)?.text ?? '';
    const found = /start-trial\?token=([^\s]+)/.exec(text);
    if (found?.[1] === undefined) throw new Error(`no link was emailed to ${email}`);
    return decodeURIComponent(found[1]);
  };
  const preview = (token: string) =>
    app.inject({ method: 'POST', url: '/staff/trial/preview', payload: { token } });
  const startTrial = (token: string, company?: string) =>
    app.inject({
      method: 'POST',
      url: '/staff/trial/start',
      payload: { token, ...(company === undefined ? {} : { company }) },
    });
  const companyCount = async (name: string) =>
    Number(
      (
        await ownerPool.query<{ n: string }>(
          `select count(*) as n from companies.companies where name = $1`,
          [name],
        )
      ).rows[0]?.n,
    );

  it('emails a firm a link, shows what it is for, and starts the trial when its button is pressed: no sign-in, no one at WagonWise', async () => {
    expect(
      (await register('sam@carter-haulage.example.com', 'company', 'Carter Haulage')).statusCode,
    ).toBe(204);
    const token = await tokenFor('sam@carter-haulage.example.com');
    expect(toOwner.at(-1)?.text).toContain('You need do nothing');

    const shown = await preview(token);
    expect(shown.statusCode).toBe(200);
    expect(shown.json()).toEqual({
      valid: true,
      started: false,
      needsCompany: false,
      email: 'sam@carter-haulage.example.com',
      company: 'Carter Haulage',
    });

    const started = await startTrial(token);
    expect(started.statusCode).toBe(200);
    expect(started.json()).toEqual({ status: 'started' });

    // A company on a free trial, its first person invited by email, and room for a few vehicles.
    const company = await ownerPool.query<{ id: string; account_status: string }>(
      `select id, account_status from companies.companies where name = 'Carter Haulage'`,
    );
    expect(company.rows).toHaveLength(1);
    expect(company.rows[0]?.account_status).toBe('trial');
    await settle();
    const invite = invitations.find((i) => i.to === 'sam@carter-haulage.example.com');
    expect(invite?.text).toContain('/join?token=');
    const invited = await ownerPool.query<{ invited_by: string | null; privileges: string[] }>(
      `select invited_by, privileges from companies.staff_invites where email = 'sam@carter-haulage.example.com'`,
    );
    expect(invited.rows[0]?.invited_by).toBeNull();
    expect(invited.rows[0]?.privileges).toContain('manage_billing');
    const room = await ownerPool.query<{ capacity: number; created_by: string | null }>(
      `select capacity, created_by from billing.capacity_changes where company_id = $1`,
      [company.rows[0]?.id],
    );
    expect(room.rows[0]).toEqual({ capacity: TRIAL_VEHICLES, created_by: null });
    const tester = await ownerPool.query<{ trial_company_id: string }>(
      `select trial_company_id from signups.testers where email = 'sam@carter-haulage.example.com'`,
    );
    expect(tester.rows[0]?.trial_company_id).toBe(company.rows[0]?.id);
    expect(toOwner.at(-1)?.subject).toBe('Trial started: Carter Haulage');

    // The link now says it was used, and pressing again makes nothing.
    expect((await preview(token)).json()).toMatchObject({ valid: true, started: true });
    expect((await startTrial(token)).json()).toEqual({ status: 'already_started' });
    expect(await companyCount('Carter Haulage')).toBe(1);
  });

  it('turns away a wrong link and a link for a driver, the same way', async () => {
    expect((await preview('this-is-not-a-real-token-at-all')).json()).toEqual({ valid: false });
    expect((await startTrial('this-is-not-a-real-token-at-all')).json()).toEqual({
      status: 'invalid',
    });
    expect((await register('dan@example.com', 'driver')).statusCode).toBe(204);
    await settle();
    expect(toRegistrant.some((m) => m.to === 'dan@example.com')).toBe(false);
    const tooShort = await startTrial('short');
    expect(tooShort.statusCode).toBe(400);
  });

  it('asks a firm with no name for one, and makes the company with the name it types', async () => {
    await register('zed@bare-haulage.example.com', 'company');
    const token = await tokenFor('zed@bare-haulage.example.com');
    expect((await preview(token)).json()).toMatchObject({ needsCompany: true });
    expect((await startTrial(token)).json()).toEqual({ status: 'needs_company' });
    expect(await companyCount('Zed Haulage')).toBe(0);
    expect((await startTrial(token, 'Zed Haulage')).json()).toEqual({ status: 'started' });
    expect(await companyCount('Zed Haulage')).toBe(1);
  });

  it('makes one firm when the button is pressed twice at the same moment', async () => {
    await register('pat@twice-haulage.example.com', 'company', 'Twice Haulage');
    const token = await tokenFor('pat@twice-haulage.example.com');
    const [a, b] = await Promise.all([startTrial(token), startTrial(token)]);
    expect([a.json().status, b.json().status].sort()).toEqual(['already_started', 'started']);
    expect(await companyCount('Twice Haulage')).toBe(1);
  });

  it('holds a second firm from the same business domain for the owner, who is told', async () => {
    await register('a@shared-domain.example.com', 'company', 'Shared North');
    await register('b@shared-domain.example.com', 'company', 'Shared South');
    expect((await startTrial(await tokenFor('a@shared-domain.example.com'))).json()).toEqual({
      status: 'started',
    });
    expect((await startTrial(await tokenFor('b@shared-domain.example.com'))).json()).toEqual({
      status: 'waiting',
    });
    await settle();
    expect(await companyCount('Shared South')).toBe(0);
    expect(toOwner.at(-1)?.subject).toBe('Trial waiting for you: Shared South');
  });

  it('stops working after two days', async () => {
    await register('late@slow-haulage.example.com', 'company', 'Slow Haulage');
    const token = await tokenFor('late@slow-haulage.example.com');
    clock.advance(49 * 60 * 60 * 1000);
    expect((await preview(token)).json()).toEqual({ valid: false });
    expect((await startTrial(token)).json()).toEqual({ status: 'invalid' });
    expect(await companyCount('Slow Haulage')).toBe(0);
  });
});
