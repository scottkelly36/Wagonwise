import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapFirstAdmin,
  createCompaniesModule,
  type CompaniesModule,
} from '../modules/companies/api.js';
import { registerStaffAuth } from '../host/staff-auth.js';
import { registerErrorHandling } from '../host/error-handler.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const PASSWORD = 'the first long password';
const NEW_PASSWORD = 'a brand new long password';

/**
 * "Forgot your password" and the join page's preview, on real Postgres with Row-Level Security and the real staff-auth hook: a person
 * joins through the real invitation flow, asks for a link, chooses a new password with it, and the old password, the old session and the
 * used link all stop working while the second check is still asked for. Nothing here says whether an address has an account.
 */
describe('forgotten passwords end to end (real RLS, real hook)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let companies: CompaniesModule;
  let app: FastifyInstance;
  const clock = new FakeClock('2026-11-24T12:00:00.000Z');
  const emails: { to: string; subject: string; text: string }[] = [];
  const codes: { destination: string; code: string }[] = [];
  let adminId = '';
  let refreshToken = '';

  const post = (url: string, payload: object, token?: string) =>
    app.inject({
      method: 'POST',
      url,
      payload,
      ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
    });
  const lastLinkToken = () => {
    const text = emails.at(-1)?.text ?? '';
    return decodeURIComponent(/token=([^\s]+)/.exec(text)?.[1] ?? '');
  };

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

    companies = createCompaniesModule({
      db,
      clock,
      ids,
      dataScopes: scopes,
      dashboardUrl: 'https://dashboard.example.test',
      identity: {
        sendOneTimeCode: (destination: string, code: string) => {
          codes.push({ destination, code });
          return Promise.resolve();
        },
        sendEmail: (to: string, subject: string, text: string) => {
          emails.push({ to, subject, text });
          return Promise.resolve();
        },
        signStaffAccessToken: () => Promise.resolve({ token: 't', expiresAt: new Date() }),
      } as never,
    });
    app = Fastify();
    registerErrorHandling(app);
    registerStaffAuth(
      app,
      { verify: (token) => Promise.resolve({ staffId: token, sessionId: 'session' }) },
      (staffId, method, path) => companies.isStaffRequestRefused(staffId, method, path),
    );
    companies.registerRoutes(app);

    // The first WagonWise admin joins the way a real one does: an invitation, a password, the first code.
    const boot = await bootstrapFirstAdmin(
      { db, clock, ids, dataScopes: scopes },
      { email: 'owner@wagonwise.example', name: 'Owner' },
    );
    if (!boot.ok) throw new Error('bootstrap');
    const accepted = await post('/staff/invites/accept', {
      inviteToken: boot.token,
      password: PASSWORD,
      secondFactorMethod: 'email',
    });
    const enrolmentId = accepted.json<{ enrolmentId: string }>().enrolmentId;
    const confirmed = await post('/staff/invites/confirm', {
      enrolmentId,
      code: codes.at(-1)?.code ?? '',
    });
    const body = confirmed.json<{ staff: { id: string }; refreshToken: string }>();
    adminId = body.staff.id;
    refreshToken = body.refreshToken;
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  it('answers the same for an address with an account and one without, and emails only the first', async () => {
    const before = emails.length;
    const known = await post('/staff/auth/forgot-password', { email: 'owner@wagonwise.example' });
    const unknown = await post('/staff/auth/forgot-password', { email: 'nobody@nowhere.example' });
    expect(known.statusCode).toBe(204);
    expect(unknown.statusCode).toBe(204);
    expect(known.body).toBe(unknown.body);
    expect(emails.length).toBe(before + 1);
    expect(emails.at(-1)?.to).toBe('owner@wagonwise.example');
    expect(emails.at(-1)?.text).toContain('https://dashboard.example.test/reset-password?token=');
  });

  it('keeps only a hash of the link, and the request and the change are in the audit log', async () => {
    const token = lastLinkToken();
    const rows = await ownerPool.query<{ token_hash: string }>(
      `select token_hash from companies.staff_password_resets`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((r) => r.token_hash !== token && r.token_hash.length === 64)).toBe(true);
    const audit = await ownerPool.query<{ action: string }>(
      `select action from companies.staff_audit where action like 'password_reset%'`,
    );
    expect(audit.rows.map((r) => r.action)).toContain('password_reset_requested');
  });

  it('refuses a short password, and a wrong link, without changing anything', async () => {
    const token = lastLinkToken();
    expect(
      (await post('/staff/auth/reset-password', { token, password: 'short' })).statusCode,
    ).toBe(400);
    const wrong = await post('/staff/auth/reset-password', {
      token: 'not-a-real-link',
      password: NEW_PASSWORD,
    });
    expect(wrong.statusCode).toBe(410);
    // The old password still works.
    const stillOld = await post('/staff/auth/sign-in', {
      email: 'owner@wagonwise.example',
      password: PASSWORD,
    });
    expect(stillOld.statusCode).toBe(200);
  });

  it('chooses a new password once: the old one, the old session and the used link all stop working, and the second check is still asked', async () => {
    const token = lastLinkToken();
    const used = await post('/staff/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(used.statusCode).toBe(204);

    expect(
      (await post('/staff/auth/sign-in', { email: 'owner@wagonwise.example', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
    const fresh = await post('/staff/auth/sign-in', {
      email: 'owner@wagonwise.example',
      password: NEW_PASSWORD,
    });
    expect(fresh.statusCode).toBe(200);
    // A challenge to answer, not a session.
    expect(fresh.json<{ challengeId?: string; accessToken?: string }>()).toMatchObject({
      challengeId: expect.any(String) as string,
    });
    expect(fresh.json<{ accessToken?: string }>().accessToken).toBeUndefined();

    // Signed out everywhere.
    const refreshed = await post('/staff/auth/refresh', { refreshToken });
    expect(refreshed.statusCode).toBe(401);

    // The same link again.
    expect(
      (await post('/staff/auth/reset-password', { token, password: 'yet another long one' }))
        .statusCode,
    ).toBe(410);
    const audit = await ownerPool.query<{ action: string }>(
      `select action from companies.staff_audit where action = 'password_reset'`,
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('sends at most three links an hour to one account', async () => {
    const before = emails.length;
    for (let i = 0; i < 6; i += 1) {
      await post('/staff/auth/forgot-password', { email: 'owner@wagonwise.example' });
    }
    // One was sent in the first test; two more fit in this hour.
    expect(emails.length - before).toBe(2);
    clock.advance(61 * 60 * 1000);
    await post('/staff/auth/forgot-password', { email: 'owner@wagonwise.example' });
    expect(emails.length - before).toBe(3);
  });

  it('a link stops working after an hour', async () => {
    const token = lastLinkToken();
    clock.advance(61 * 60 * 1000);
    expect(
      (await post('/staff/auth/reset-password', { token, password: 'a long password again' }))
        .statusCode,
    ).toBe(410);
  });

  it('tells the join page whose invitation it is and which company it is for, to no one without the link', async () => {
    const created = await post(
      '/staff/companies',
      { id: '91000000-0000-4000-8000-000000000001', name: 'Acme Haulage' },
      adminId,
    );
    expect(created.statusCode).toBe(201);
    const invite = await post(
      '/staff/invites',
      {
        kind: 'fleet',
        email: 'sam@acme.example',
        name: 'Sam Hall',
        companyId: '91000000-0000-4000-8000-000000000001',
        privileges: ['manage_users'],
      },
      adminId,
    );
    expect(invite.statusCode).toBe(201);
    const token = invite.json<{ inviteToken: string }>().inviteToken;
    const preview = await post('/staff/invites/preview', { inviteToken: token });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual({ name: 'Sam Hall', companyName: 'Acme Haulage' });
    expect((await post('/staff/invites/preview', { inviteToken: 'nonsense' })).statusCode).toBe(
      410,
    );
  });
});
