import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFleetModule } from '../modules/fleet/api.js';
import {
  createJobsModule,
  type Caller,
  type DeliveryReport,
  type DriverMessage,
} from '../modules/jobs/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { err } from '../shared/result.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const DRIVER = 'dddddddd-0000-4000-8000-000000000001';
const OTHER_DRIVER = 'dddddddd-0000-4000-8000-000000000002';
const VEHICLE = 'eeeeeeee-0000-4000-8000-000000000001';
const DISPATCHER = '50000000-0000-4000-8000-000000000001';
const VIEWER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const callers: Record<string, Caller> = {
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [VIEWER]: { kind: 'fleet', companyId: ACME as never, privileges: [] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['dispatch'] },
};

const stops = [
  { kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Port', location: { lat: 54.97, lon: -1.6 } },
];

/**
 * A driver is pushed a notification when a job is assigned, and the office can see how that went and send it again.
 * Real `jobs` module on real Postgres with Row-Level Security: the office's reads and the driver's "I opened it" write
 * each run in their own scope.
 */
describe('job notices end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  const pushed: { driverId: string; message: DriverMessage }[] = [];
  let report: DeliveryReport = { devices: 0, accepted: 0 };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    await ownerPool.query(`
      insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
        values ('f1000000-0000-4000-8000-000000000001', '${ACME}', '${DRIVER}', 'active', now(), now()),
               ('f1000000-0000-4000-8000-000000000002', '${ACME}', '${OTHER_DRIVER}', 'active', now(), now());
    `);

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined);
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });
    const clock = new FakeClock('2026-10-09T09:00:00.000Z');
    const fleet = createFleetModule({
      db,
      ids: new SequentialIdGenerator(),
      clock,
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities: { getIdentifier: () => Promise.resolve(null) },
      companyNames: { namesFor: () => Promise.resolve(new Map()) },
      vehicleCapacity: { capacityFor: () => Promise.resolve(99) },
    });
    const jobs = createJobsModule({
      db,
      ids: new SequentialIdGenerator(),
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(callers[id] ?? null) },
      drivers: { belongsToCompany: (id, company) => fleet.isActiveDriverOfCompany(id, company) },
      vehicles: {
        belongsToCompany: (id, company) => Promise.resolve(id === VEHICLE && company === ACME),
      },
      vehicleNames: { getName: () => Promise.resolve(null) },
      routes: { estimate: () => Promise.resolve(err({ tag: 'NoRoute' } as never)) },
      navigationProfiles: { provision: () => Promise.resolve(err({ tag: 'VehicleUnavailable' })) },
      driverIdentities: {
        getIdentifier: (id) =>
          Promise.resolve(
            id === DRIVER ? 'driver@example.com' : id === OTHER_DRIVER ? 'o@example.com' : null,
          ),
      },
      notifier: {
        notify: (driverId, message) => {
          pushed.push({ driverId, message });
          return Promise.resolve(report);
        },
      },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const staffId = request.headers['x-test-staff-id'];
      if (typeof staffId === 'string') request.staffId = staffId;
      const driverId = request.headers['x-test-driver-id'];
      if (typeof driverId === 'string') request.driverId = driverId;
      done();
    });
    jobs.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const asDriver = (id: string) => ({ headers: { 'x-test-driver-id': id } });
  let jobId = '';
  const notices = (who: string, company = ACME) =>
    app.inject({ method: 'GET', url: `/staff/jobs/companies/${company}/notices`, ...as(who) });

  it('pushes to the driver when a job is assigned, and records that it went', async () => {
    report = { devices: 0, accepted: 0 };
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'PUSH-1', stops },
      ...as(DISPATCHER),
    });
    jobId = created.json<{ id: string }>().id;
    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${jobId}/assign`,
      payload: { driverId: DRIVER, vehicleId: VEHICLE },
      ...as(DISPATCHER),
    });
    expect(assigned.statusCode).toBe(200);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      driverId: DRIVER,
      message: { title: 'New job assigned', body: 'PUSH-1: Depot', data: { jobId } },
    });
    const listed = (await notices(VIEWER)).json<{ notices: Record<string, unknown>[] }>();
    expect(listed.notices).toEqual([
      expect.objectContaining({
        jobId,
        driverId: DRIVER,
        result: 'no_device',
        attempts: 1,
        seenAt: null,
      }),
    ]);
  });

  it('sends it again from the office once the driver has a phone registered', async () => {
    report = { devices: 1, accepted: 1 };
    const resent = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${jobId}/resend-notice`,
      ...as(DISPATCHER),
    });
    expect(resent.statusCode).toBe(200);
    expect(resent.json()).toMatchObject({ result: 'sent', devices: 1, attempts: 2 });
    expect(pushed).toHaveLength(2);
  });

  it('keeps resending to dispatchers, and other companies out', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/staff/jobs/${jobId}/resend-notice`,
          ...as(VIEWER),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/staff/jobs/${jobId}/resend-notice`,
          ...as(RIVAL),
        })
      ).statusCode,
    ).toBe(404);
    expect((await notices(RIVAL, ACME)).statusCode).toBe(403);
    expect((await notices(RIVAL, BETA)).json<{ notices: unknown[] }>().notices).toEqual([]);
    expect(pushed).toHaveLength(2);
  });

  it('notes when the driver first opens the job, and only their own', async () => {
    const other = await app.inject({
      method: 'GET',
      url: '/jobs/current',
      ...asDriver(OTHER_DRIVER),
    });
    expect(other.json()).toEqual({ job: null });
    const before = (await notices(VIEWER)).json<{ notices: { seenAt: string | null }[] }>();
    expect(before.notices[0]?.seenAt).toBeNull();

    const mine = await app.inject({ method: 'GET', url: '/jobs/current', ...asDriver(DRIVER) });
    expect(mine.json<{ job: { id: string } }>().job.id).toBe(jobId);
    const after = (await notices(VIEWER)).json<{ notices: { seenAt: string | null }[] }>();
    expect(after.notices[0]?.seenAt).not.toBeNull();
  });

  it('has nothing to send once the driver accepts', async () => {
    const accepted = await app.inject({
      method: 'POST',
      url: `/jobs/${jobId}/status`,
      payload: { status: 'accepted' },
      ...asDriver(DRIVER),
    });
    expect(accepted.statusCode).toBe(200);
    const resent = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${jobId}/resend-notice`,
      ...as(DISPATCHER),
    });
    expect(resent.statusCode).toBe(409);
    expect((await notices(VIEWER)).json<{ notices: unknown[] }>().notices).toEqual([]);
  });
});
