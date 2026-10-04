import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFleetModule } from '../modules/fleet/api.js';
import { createJobsModule, type Caller } from '../modules/jobs/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { err, ok } from '../shared/result.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const DRIVER = 'dddddddd-0000-4000-8000-000000000001';
const UNLINKED_DRIVER = 'dddddddd-0000-4000-8000-000000000002';
const VEHICLE = 'eeeeeeee-0000-4000-8000-000000000001';

const callers: Record<string, Caller> = {
  'acme-dispatcher': { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  'beta-dispatcher': { kind: 'fleet', companyId: BETA as never, privileges: ['dispatch'] },
};

const stops = [
  { kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Port', location: { lat: 54.97, lon: -1.6 } },
];

/**
 * P2-M3's proof that dispatch works the way production runs it: through the real `jobs` module,
 * as `wagonwise_app`, inside real `DataScopes` transactions with Row-Level Security on. This is
 * the layer that catches what fakes can't — a repository opening a nested transaction (the
 * recovery-code bug, docs/progress.md), or a policy hiding a company's own rows from it.
 */
describe('jobs dispatch end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined); // a pool is torn down with its container
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    // DRIVER is an active member of ACME (P2-M2.8: what jobs' driver directory now checks, via
    // fleet.driver_links, in place of the old single identity.drivers.company_id).
    // UNLINKED_DRIVER exists but was never approved — assigning them must fail the same way.
    await ownerPool.query(`
      insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
        values ('f1000000-0000-4000-8000-000000000001', '${ACME}', '${DRIVER}', 'active', now(), now());
      insert into fleet.driver_links (id, company_id, driver_id, status, created_at)
        values ('f1000000-0000-4000-8000-000000000002', '${ACME}', '${UNLINKED_DRIVER}', 'requested', now());
    `);

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined); // a pool is torn down with its container
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });

    const fleet = createFleetModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-01T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities: { getIdentifier: () => Promise.resolve(null) },
      companyNames: { namesFor: () => Promise.resolve(new Map()) },
    });
    const jobs = createJobsModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-01T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(callers[staffId] ?? null) },
      // Same wiring as compose-core.ts: jobs' driver directory is fleet's active links now.
      drivers: {
        belongsToCompany: (id, company) => fleet.isActiveDriverOfCompany(id, company),
      },
      vehicles: {
        belongsToCompany: (id, company) => Promise.resolve(id === VEHICLE && company === ACME),
      },
      // A fixed answer: what is under test here is jobs' own use of the estimator, not Valhalla.
      routes: {
        estimate: () =>
          Promise.resolve(ok({ distanceKm: 40, durationMin: 50, geometry: 'a-line' })),
      },
      // Not exercised here: the navigation profile has its own tests.
      navigationProfiles: {
        provision: () => Promise.resolve(err({ tag: 'VehicleUnavailable' })),
      },
      driverIdentities: {
        getIdentifier: (id) =>
          Promise.resolve(
            id === DRIVER
              ? 'driver@example.com'
              : id === UNLINKED_DRIVER
                ? 'unlinked@example.com'
                : null,
          ),
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

  const as = (staffId: string) => ({ headers: { 'x-test-staff-id': staffId } });

  it('creates, assigns and delivers a job, with its events in the outbox', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'E2E-1', stops },
      ...as('acme-dispatcher'),
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();

    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: DRIVER, vehicleId: VEHICLE },
      ...as('acme-dispatcher'),
    });
    expect(assigned.statusCode).toBe(200);

    for (const status of [
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ]) {
      const r = await app.inject({
        method: 'POST',
        url: `/staff/jobs/${id}/status`,
        payload: { status },
        ...as('acme-dispatcher'),
      });
      expect(r.statusCode).toBe(200);
    }

    const { rows } = await ownerPool.query<{ event_type: string }>(
      `select event_type from outbox.events where aggregate_id = $1 order by event_type`,
      [id],
    );
    const counts = rows.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [r.event_type]: (acc[r.event_type] ?? 0) + 1 }),
      {},
    );
    expect(counts).toEqual({
      JobAssigned: 1,
      JobCompleted: 1,
      JobCreated: 1,
      JobStatusChanged: 7,
    });

    const got = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}`,
      ...as('acme-dispatcher'),
    });
    expect(got.json()).toMatchObject({ status: 'delivered', driverId: DRIVER });
    expect(got.json<{ stops: unknown[] }>().stops).toHaveLength(2);
  });

  it('shows where a driver on the road is and how long they have to go', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'E2E-LIVE', stops },
      ...as('acme-dispatcher'),
    });
    const { id } = created.json<{ id: string }>();
    await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: DRIVER, vehicleId: VEHICLE },
      ...as('acme-dispatcher'),
    });
    const asDriver = { headers: { 'x-test-driver-id': DRIVER } };
    const position = { location: { lat: 54.97, lon: -2.0 } };

    // Not yet accepted: nothing is stored.
    const early = await app.inject({
      method: 'POST',
      url: `/jobs/${id}/position`,
      payload: position,
      ...asDriver,
    });
    expect(early.statusCode).toBe(409);

    for (const status of ['accepted', 'at_pickup', 'loaded', 'en_route']) {
      await app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status },
        ...asDriver,
      });
    }
    const sent = await app.inject({
      method: 'POST',
      url: `/jobs/${id}/position`,
      payload: position,
      ...asDriver,
    });
    expect(sent.statusCode).toBe(204);

    const positions = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/positions`,
      ...as('acme-dispatcher'),
    });
    expect(
      positions.json<{ positions: { jobId: string }[] }>().positions.map((p) => p.jobId),
    ).toEqual([id]);

    const etas = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/etas`,
      ...as('acme-dispatcher'),
    });
    expect(etas.statusCode).toBe(200);
    expect(etas.json()).toMatchObject({
      etas: [{ jobId: id, stopKind: 'delivery', durationMin: 50, geometry: 'a-line' }],
    });

    // Another company sees none of it.
    const other = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${ACME}/etas`,
      ...as('beta-dispatcher'),
    });
    expect(other.statusCode).toBe(403);

    // Leave the driver free: other tests in this file assign the same driver.
    await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/cancel`,
      ...as('acme-dispatcher'),
    });
  });

  it('refuses to assign a driver who only requested to join, never approved', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'E2E-UNLINKED', stops },
      ...as('acme-dispatcher'),
    });
    const { id } = created.json<{ id: string }>();

    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: UNLINKED_DRIVER, vehicleId: VEHICLE },
      ...as('acme-dispatcher'),
    });
    expect(assigned.statusCode).toBe(400);
    expect(assigned.json()).toMatchObject({ tag: 'DriverNotInCompany' });
  });

  it("keeps one company's jobs from another's, in the database as well as the use case", async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'E2E-2', stops },
      ...as('acme-dispatcher'),
    });
    const { id } = created.json<{ id: string }>();

    const peek = await app.inject({
      method: 'GET',
      url: `/staff/jobs/${id}`,
      ...as('beta-dispatcher'),
    });
    expect(peek.statusCode).toBe(404);

    const list = await app.inject({
      method: 'GET',
      url: `/staff/jobs/companies/${BETA}/jobs`,
      ...as('beta-dispatcher'),
    });
    expect(list.json<{ jobs: unknown[] }>().jobs).toEqual([]);

    const planted = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'E2E-3', stops },
      ...as('beta-dispatcher'),
    });
    expect(planted.statusCode).toBe(403);
  });

  describe('the driver on the job (P2-M5.1)', () => {
    const asDriver = (driverId: string) => ({ headers: { 'x-test-driver-id': driverId } });

    it('sees only the job assigned to them, and can move it forward themselves', async () => {
      const created = await app.inject({
        method: 'POST',
        url: `/staff/jobs/companies/${ACME}/jobs`,
        payload: { companyId: ACME, reference: 'E2E-DRIVER', stops },
        ...as('acme-dispatcher'),
      });
      const { id } = created.json<{ id: string }>();
      await app.inject({
        method: 'POST',
        url: `/staff/jobs/${id}/assign`,
        payload: { driverId: DRIVER, vehicleId: VEHICLE },
        ...as('acme-dispatcher'),
      });

      const current = await app.inject({
        method: 'GET',
        url: '/jobs/current',
        ...asDriver(DRIVER),
      });
      expect(current.statusCode).toBe(200);
      expect(current.json<{ job: { id: string; status: string } | null }>().job).toMatchObject({
        id,
        status: 'assigned',
      });

      const advanced = await app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status: 'accepted' },
        ...asDriver(DRIVER),
      });
      expect(advanced.statusCode).toBe(200);
      expect(advanced.json()).toMatchObject({ status: 'accepted' });

      // RLS (migration 0030), not just the use case's own check: a driver with no link to this
      // job can't even find the row to advance it.
      const outsider = await app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status: 'at_pickup' },
        ...asDriver(UNLINKED_DRIVER),
      });
      expect(outsider.statusCode).toBe(404);

      // Assigning and cancelling stay dispatcher-only.
      const cancelled = await app.inject({
        method: 'POST',
        url: `/jobs/${id}/cancel`,
        ...asDriver(DRIVER),
      });
      expect(cancelled.statusCode).toBe(404); // no driver route exists for it at all

      const noJob = await app.inject({
        method: 'GET',
        url: '/jobs/current',
        ...asDriver(UNLINKED_DRIVER),
      });
      expect(noJob.json()).toEqual({ job: null });
    });
  });
});
