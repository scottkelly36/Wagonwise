import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MyReferralsResponse, StaffReferralDto } from '@wagonwise/contracts/referrals';
import { createReferralsModule, type StaffCaller } from '../modules/referrals/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const ADMIN = '70000000-0000-4000-8000-000000000001';
const FLEET = '70000000-0000-4000-8000-000000000002';
const DAVE = '71000000-0000-4000-8000-000000000001';
const SAM = '71000000-0000-4000-8000-000000000002';
const staff: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [FLEET]: { kind: 'fleet', companyId: 'c', privileges: ['manage_fleet'] },
};

/** Referrals on real Postgres as the restricted app role: codes, one reward per firm, the claim, and erasure. */
describe('referrals end to end (real Postgres, app role)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let referrals: ReturnType<typeof createReferralsModule>;
  let app: FastifyInstance;

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
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: appPool }),
    });
    referrals = createReferralsModule({
      db,
      ids: new UuidIdGenerator(),
      clock: new FakeClock('2026-11-20T10:00:00.000Z'),
      callers: { getCaller: (staffId) => Promise.resolve(staff[staffId] ?? null) },
      driverLabels: { label: (driverId) => Promise.resolve(driverId === DAVE ? 'Dave' : null) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const staffId = request.headers['x-test-staff-id'];
      if (typeof staffId === 'string') request.staffId = staffId;
      const driverId = request.headers['x-test-driver-id'];
      if (typeof driverId === 'string') request.driverId = driverId;
      done();
    });
    referrals.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const asDriver = (driver: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { 'x-test-driver-id': driver },
      ...(payload ? { payload } : {}),
    });
  const asStaff = (who: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { 'x-test-staff-id': who },
      ...(payload ? { payload } : {}),
    });

  it('gives a driver one code, and takes a referral through to sent, once per firm', async () => {
    const me = (await asDriver(DAVE, 'GET', '/referrals/me')).json<MyReferralsResponse>();
    expect(me.code).toMatch(/^WW-[A-HJKMNP-Z2-9]{6}$/);
    expect(me.rewardPounds).toBe(25);
    expect((await asDriver(DAVE, 'GET', '/referrals/me')).json<MyReferralsResponse>().code).toBe(
      me.code,
    );

    // Staff look the code up, typed in lower case, then record the firm.
    const lookup = await asStaff(ADMIN, 'GET', `/staff/referrals/codes/${me.code.toLowerCase()}`);
    expect(lookup.json()).toEqual({ code: me.code, driverLabel: 'Dave' });
    const made = await asStaff(ADMIN, 'POST', '/staff/referrals', {
      code: me.code,
      firmName: 'Tyne Haulage Ltd',
    });
    expect(made.statusCode).toBe(201);
    const ref = made.json<StaffReferralDto>();
    expect(ref).toMatchObject({
      driverLabel: 'Dave',
      firmName: 'Tyne Haulage Ltd',
      status: 'signed_up',
      rewardEmail: null,
    });
    expect(
      (
        await asStaff(ADMIN, 'POST', '/staff/referrals', {
          code: me.code,
          firmName: 'TYNE HAULAGE LIMITED',
        })
      ).statusCode,
    ).toBe(409);

    // Not claimable until paid, and never by another driver.
    expect(
      (await asDriver(DAVE, 'POST', `/referrals/${ref.id}/claim`, { email: 'dave@example.com' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await asStaff(ADMIN, 'PUT', `/staff/referrals/${ref.id}/status`, { status: 'reward_due' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await asDriver(SAM, 'POST', `/referrals/${ref.id}/claim`, { email: 'sam@example.com' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await asDriver(DAVE, 'POST', `/referrals/${ref.id}/claim`, { email: 'dave@example.com' }))
        .statusCode,
    ).toBe(200);
    const sent = await asStaff(ADMIN, 'PUT', `/staff/referrals/${ref.id}/status`, {
      status: 'sent',
    });
    expect(sent.json<StaffReferralDto>()).toMatchObject({
      status: 'sent',
      rewardEmail: 'dave@example.com',
    });
    expect(
      (await asDriver(DAVE, 'GET', '/referrals/me')).json<MyReferralsResponse>().referrals,
    ).toEqual([expect.objectContaining({ firmName: 'Tyne Haulage Ltd', status: 'sent' })]);
  });

  it('refuses a firm’s staff, a stranger, and a code nobody has', async () => {
    expect((await asStaff(FLEET, 'GET', '/staff/referrals')).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/referrals/me' })).statusCode).toBe(401);
    expect(
      (await asStaff(ADMIN, 'POST', '/staff/referrals', { code: 'WW-ZZZZZZ', firmName: 'X' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await asStaff(ADMIN, 'POST', '/staff/referrals', { code: 'not a code', firmName: 'X' }))
        .statusCode,
    ).toBe(400);
  });

  it('erases a deleted driver’s code and referrals, with the email they gave', async () => {
    await referrals.eraseDriverData(DAVE);
    const { rows } = await ownerPool.query(
      `select (select count(*) from referrals.codes where driver_id = $1)::int as codes,
              (select count(*) from referrals.referrals where driver_id = $1)::int as refs`,
      [DAVE],
    );
    expect(rows[0]).toEqual({ codes: 0, refs: 0 });
  });
});
