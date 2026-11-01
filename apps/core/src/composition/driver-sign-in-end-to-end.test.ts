import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIdentityModule,
  createTokenSigner,
  type UntypedDb,
} from '../modules/identity/api.js';
import { createDb, createPool } from '../platform/db.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { PostgresUnitOfWork } from '../platform/postgres-unit-of-work.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const PASSWORD = 'a long enough password';

/**
 * Email-and-password sign-in and Google/Apple sign-in on real Postgres, through identity's own module wiring (the real repositories,
 * the real unit of work, the real routes): the account and its password are made in one commit, a code alone is refused once there is a
 * password, five wrong passwords lock the account, Google joins an account by its confirmed email, and deleting the account removes the
 * password and the link. Only the ID-token check and the email delivery are stood in for.
 */
describe('driver sign-in end to end (real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: FastifyInstance;
  const sent: { identifier: string; code: string }[] = [];
  // Stands in for Google's and Apple's token check: knows the tokens a test registers, keyed "provider:token", and refuses any other.
  const knownTokens = new Map<string, { subject: string; email: string; emailVerified: boolean }>();
  const idTokens = {
    tokens: knownTokens,
    verify: (provider: string, idToken: string) => {
      const identity = knownTokens.get(`${provider}:${idToken}`);
      return Promise.resolve(
        identity
          ? { ok: true as const, value: identity }
          : { ok: false as const, error: { tag: 'InvalidIdToken' as const } },
      );
    },
  };
  const clock = new FakeClock('2026-11-01T09:00:00.000Z');

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    await runMigrations(pool, migrationsDir);
    const db = createDb(pool);
    const identity = createIdentityModule({
      db: db as unknown as UntypedDb,
      clock,
      ids: new SequentialIdGenerator(),
      unitOfWork: new PostgresUnitOfWork(db),
      tokenSigner: await createTokenSigner(undefined),
      platformStaff: { isPlatformStaff: () => Promise.resolve(false) },
      driverDataEraser: { erase: () => Promise.resolve() },
      otpSender: {
        send: (identifier, code) => {
          sent.push({ identifier, code });
          return Promise.resolve();
        },
      },
      inviteRequired: false,
      passwordSignIn: true,
      googleClientIds: ['web-client'],
      appleClientIds: [],
      idTokenVerifier: idTokens,
    });
    app = Fastify();
    // Stands in for core's driver-auth hook.
    app.decorateRequest('driverId', undefined);
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-driver-id'];
      if (typeof id === 'string') request.driverId = id;
      done();
    });
    identity.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
    await container.stop();
  });

  const post = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, payload });
  const lastCode = () => sent.at(-1)?.code;
  /** A response body, typed for what the test reads from it. */
  const body = <T>(response: { json(): unknown }): T => response.json() as T;
  const count = async (table: string): Promise<number> =>
    (await pool.query<{ n: number }>(`select count(*)::int as n from identity.${table}`)).rows[0]
      ?.n ?? 0;

  async function signUp(email: string): Promise<string> {
    expect((await post('/identity/signup/request', { email })).statusCode).toBe(200);
    const response = await post('/identity/signup/confirm', {
      email,
      password: PASSWORD,
      code: lastCode(),
    });
    expect(response.statusCode).toBe(200);
    return body<{ driver: { id: string } }>(response).driver.id;
  }

  it('signs up with no invite code, storing a hash and never the password', async () => {
    const id = await signUp('sam@example.com');
    const row = (
      await pool.query<{ password_hash: string }>(
        `select password_hash from identity.driver_credentials where driver_id = $1`,
        [id],
      )
    ).rows[0];
    expect(row?.password_hash).toMatch(/^scrypt\$/);
    expect(row?.password_hash).not.toContain(PASSWORD);
  });

  it('signs in with the password and then a code, and refuses a code on its own', async () => {
    expect(
      (
        await post('/identity/password/sign-in', {
          identifier: 'sam@example.com',
          password: PASSWORD,
        })
      ).statusCode,
    ).toBe(200);
    const done = await post('/identity/password/verify', {
      identifier: 'sam@example.com',
      code: lastCode(),
    });
    expect(done.statusCode).toBe(200);
    expect(body<{ accessToken: string }>(done).accessToken).toBeTruthy();

    const codeOnly = await post('/identity/otp/request', { identifier: 'sam@example.com' });
    expect(codeOnly.statusCode).toBe(409);
    expect(codeOnly.json()).toMatchObject({ tag: 'PasswordRequired' });
  });

  it('locks the account after five wrong passwords, then lets it back in when the time is up', async () => {
    for (let i = 0; i < 5; i++) {
      const wrong = await post('/identity/password/sign-in', {
        identifier: 'sam@example.com',
        password: 'definitely not it',
      });
      expect(wrong.statusCode).toBe(401);
    }
    const locked = await post('/identity/password/sign-in', {
      identifier: 'sam@example.com',
      password: PASSWORD,
    });
    expect(locked.statusCode).toBe(429);
    clock.advance(16 * 60 * 1000);
    const back = await post('/identity/password/sign-in', {
      identifier: 'sam@example.com',
      password: PASSWORD,
    });
    expect(back.statusCode).toBe(200);
  });

  it('resets a forgotten password and ends the other sessions', async () => {
    expect(
      (await post('/identity/password/reset/request', { email: 'sam@example.com' })).statusCode,
    ).toBe(200);
    const reset = await post('/identity/password/reset/confirm', {
      email: 'sam@example.com',
      code: lastCode(),
      newPassword: 'a brand new password',
    });
    expect(reset.statusCode).toBe(200);
    const revoked = (
      await pool.query<{ n: number }>(
        `select count(*)::int as n from identity.sessions where revoked_at is not null`,
      )
    ).rows[0]?.n;
    expect(revoked).toBeGreaterThan(0);
  });

  it('signs in with Google: joins the account with the same confirmed email, and makes a new one otherwise', async () => {
    const before = await count('drivers');
    idTokens.tokens.set('google:joins', {
      subject: 'g-1',
      email: 'sam@example.com',
      emailVerified: true,
    });
    const joined = await post('/identity/social/sign-in', { provider: 'google', idToken: 'joins' });
    expect(joined.statusCode).toBe(200);
    expect(await count('drivers')).toBe(before);
    expect(await count('federated_identities')).toBe(1);

    idTokens.tokens.set('google:new', {
      subject: 'g-2',
      email: 'kim@example.com',
      emailVerified: true,
    });
    const created = await post('/identity/social/sign-in', { provider: 'google', idToken: 'new' });
    expect(created.statusCode).toBe(200);
    expect(body<{ driver: { identifier: string } }>(created).driver.identifier).toBe(
      'kim@example.com',
    );
    expect(await count('drivers')).toBe(before + 1);

    const forged = await post('/identity/social/sign-in', {
      provider: 'google',
      idToken: 'forged',
    });
    expect(forged.statusCode).toBe(401);
    const apple = await post('/identity/social/sign-in', { provider: 'apple', idToken: 'x' });
    expect(apple.statusCode).toBe(401);
  });

  it('removes the password and the Google link when the account is deleted', async () => {
    const id =
      (
        await pool.query<{ id: string }>(
          `select id from identity.drivers where identifier = 'sam@example.com'`,
        )
      ).rows[0]?.id ?? '';
    const gone = await app.inject({
      method: 'DELETE',
      url: '/identity/account',
      headers: { 'x-test-driver-id': id },
    });
    expect(gone.statusCode).toBe(204);
    expect(
      (await pool.query(`select 1 from identity.driver_credentials where driver_id = $1`, [id]))
        .rowCount,
    ).toBe(0);
    expect(
      (await pool.query(`select 1 from identity.federated_identities where driver_id = $1`, [id]))
        .rowCount,
    ).toBe(0);
  });

  describe('a driver who signed up with a phone number', () => {
    const PHONE = '+447700900555';
    let id = '';

    const postAs = (url: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url, payload, headers: { 'x-test-driver-id': id } });

    it('signs up by text code as before', async () => {
      expect((await post('/identity/otp/request', { identifier: PHONE })).statusCode).toBe(200);
      const done = await post('/identity/otp/verify', { identifier: PHONE, code: lastCode() });
      expect(done.statusCode).toBe(200);
      id = body<{ driver: { id: string } }>(done).driver.id;
    });

    it('cannot start a password yet: there is no email', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/identity/account/password',
        payload: { password: PASSWORD },
        headers: { 'x-test-driver-id': id },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ tag: string }>().tag).toBe('EmailRequired');
    });

    it('adds a Google login, and then signing in with Google finds this account, not a new one', async () => {
      knownTokens.set('google:phone-user', {
        subject: 'g-phone',
        email: 'phone.user@gmail.com',
        emailVerified: true,
      });
      expect(
        (
          await postAs('/identity/account/link/social', {
            provider: 'google',
            idToken: 'phone-user',
          })
        ).statusCode,
      ).toBe(204);
      const before = await count('drivers');
      const again = await post('/identity/social/sign-in', {
        provider: 'google',
        idToken: 'phone-user',
      });
      expect(again.statusCode).toBe(200);
      expect(body<{ driver: { id: string } }>(again).driver.id).toBe(id);
      expect(await count('drivers')).toBe(before);
    });

    it('refuses a Google login that is already on another account', async () => {
      const response = await postAs('/identity/account/link/social', {
        provider: 'google',
        idToken: 'new',
      });
      expect(response.statusCode).toBe(409);
      expect(response.json<{ tag: string }>().tag).toBe('AlreadyLinked');
    });

    it('adds an email with a code; the account keeps its id and can then have a password', async () => {
      expect(
        (await postAs('/identity/account/email/request', { email: 'phone.user@example.com' }))
          .statusCode,
      ).toBe(200);
      const done = await postAs('/identity/account/email/confirm', {
        email: 'phone.user@example.com',
        code: lastCode(),
      });
      expect(done.statusCode).toBe(200);
      expect(body<{ id: string; identifier: string }>(done)).toMatchObject({
        id,
        identifier: 'phone.user@example.com',
      });

      const password = await app.inject({
        method: 'PUT',
        url: '/identity/account/password',
        payload: { password: PASSWORD },
        headers: { 'x-test-driver-id': id },
      });
      expect(password.statusCode).toBe(204);

      const taken = await postAs('/identity/account/email/request', { email: 'kim@example.com' });
      expect(taken.statusCode).toBe(409);
    });
  });
});
