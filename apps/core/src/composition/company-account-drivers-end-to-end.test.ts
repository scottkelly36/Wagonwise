import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompaniesModule, type CompaniesModule } from '../modules/companies/api.js';
import { createFleetModule } from '../modules/fleet/api.js';
import { createHoursModule } from '../modules/hours/api.js';
import { createJobsModule, type Caller } from '../modules/jobs/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { err, ok } from '../shared/result.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const SAM = 'dddddddd-0000-4000-8000-000000000001'; // drives for Acme
const KIM = 'dddddddd-0000-4000-8000-000000000002'; // drives for Beta
const VEHICLE = 'eeeeeeee-0000-4000-8000-000000000001';

const ACME_BOSS = '70000000-0000-4000-8000-000000000002';
const BETA_BOSS = '70000000-0000-4000-8000-000000000003';

const callers: Record<string, Caller> = {
  [ACME_BOSS]: {
    kind: 'fleet',
    companyId: ACME as never,
    privileges: ['dispatch', 'manage_fleet'],
  },
  [BETA_BOSS]: {
    kind: 'fleet',
    companyId: BETA as never,
    privileges: ['dispatch', 'manage_fleet'],
  },
};
const identifiers: Record<string, string> = { [SAM]: 'sam@example.com', [KIM]: 'kim@example.com' };

const stops = [
  { kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Port', location: { lat: 54.97, lon: -1.6 } },
];

/**
 * What a paused company means for its drivers (docs/company-account-states-scope.md), through the real companies, fleet, jobs and
 * hours modules on real Postgres with Row-Level Security on, wired as compose-core.ts wires them: a paused company's drivers see
 * none of its jobs, report no position and share no hours; another company's drivers are untouched; and the firm coming back
 * brings everything back, nothing having been deleted.
 */
describe('company account states: the drivers (real RLS, real modules)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let companies: CompaniesModule;
  const clock = new FakeClock('2026-11-23T12:00:00.000Z');

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    await ownerPool.query(
      `insert into companies.companies (id, name, created_at) values ($1,'Acme Haulage',now()),($2,'Beta Freight',now())`,
      [ACME, BETA],
    );
    await ownerPool.query(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1,'fleet',$3,'boss@acme.test','Acme Boss','["manage_fleet"]',now(),'x','email'),
              ($2,'fleet',$4,'boss@beta.test','Beta Boss','["manage_fleet"]',now(),'x','email')`,
      [ACME_BOSS, BETA_BOSS, ACME, BETA],
    );
    await ownerPool.query(
      `insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at) values
         ('f1000000-0000-4000-8000-000000000001', $1, $3, 'active', now(), now()),
         ('f1000000-0000-4000-8000-000000000002', $2, $4, 'active', now(), now())`,
      [ACME, BETA, SAM, KIM],
    );

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined);
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });

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
    const fleet = createFleetModule({
      db,
      ids: new SequentialIdGenerator(),
      clock,
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities: {
        getIdentifier: (id) => Promise.resolve(identifiers[id] ?? null),
        getName: () => Promise.resolve(null),
      },
      companyNames: { namesFor: () => Promise.resolve(new Map()) },
      vehicleCapacity: { capacityFor: () => Promise.resolve(99) },
    });
    const jobs = createJobsModule({
      db,
      ids: new SequentialIdGenerator(),
      clock,
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(callers[staffId] ?? null) },
      drivers: { belongsToCompany: (id, company) => fleet.isActiveDriverOfCompany(id, company) },
      vehicles: {
        belongsToCompany: (id, company) =>
          Promise.resolve(id === VEHICLE && (company === ACME || company === BETA)),
      },
      vehicleNames: { getName: () => Promise.resolve(null) },
      routes: {
        estimate: () =>
          Promise.resolve(ok({ distanceKm: 40, durationMin: 50, geometry: 'a-line' })),
      },
      navigationProfiles: { provision: () => Promise.resolve(err({ tag: 'VehicleUnavailable' })) },
      driverIdentities: {
        getName: () => Promise.resolve(null),
        getIdentifier: (id) => Promise.resolve(identifiers[id] ?? null),
      },
      // The same wiring as compose-core.ts.
      companyAccounts: { pausedCompanyName: (companyId) => companies.pausedCompanyName(companyId) },
    });
    const hours = createHoursModule({
      db,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(callers[staffId] ?? null) },
      driverIdentities: { getIdentifier: (id) => Promise.resolve(identifiers[id] ?? null) },
      driverCompanies: {
        activeCompanies: async (driverId, identifier) =>
          (await fleet.activeCompaniesOfDriver(driverId, identifier)).map((c) => ({
            id: c.id as never,
            name: c.name,
          })),
      },
      activeJobs: {
        companyOfActiveJob: async (driverId) =>
          ((await jobs.activeCompanyFor(driverId)) as never) ?? null,
        driversOnJobs: async (companyId) => (await jobs.activeDriverIds(companyId)) as never,
      },
      companyAccounts: { pausedCompanyName: (companyId) => companies.pausedCompanyName(companyId) },
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
    hours.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const staff = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const driver = (id: string) => ({ headers: { 'x-test-driver-id': id } });
  const setStatus = async (company: string, status: 'active' | 'paused') => {
    await ownerPool.query(`update companies.companies set account_status = $2 where id = $1`, [
      company,
      status,
    ]);
    // The state is remembered a few seconds; let it lapse so the change is seen on the next request.
    clock.advance(10_000);
  };

  async function jobOnTheRoad(boss: string, company: string, driverId: string, reference: string) {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${company}/jobs`,
      payload: { companyId: company, reference, stops },
      ...staff(boss),
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId, vehicleId: VEHICLE },
      ...staff(boss),
    });
    expect(assigned.statusCode).toBe(200);
    for (const status of ['accepted', 'at_pickup', 'loaded', 'en_route']) {
      const r = await app.inject({
        method: 'POST',
        url: `/jobs/${id}/status`,
        payload: { status },
        ...driver(driverId),
      });
      expect([status, r.statusCode]).toEqual([status, 200]);
    }
    return id;
  }

  it('keeps both firms working while neither is paused', async () => {
    const acmeJob = await jobOnTheRoad(ACME_BOSS, ACME, SAM, 'ACME-1');
    await jobOnTheRoad(BETA_BOSS, BETA, KIM, 'BETA-1');

    const current = await app.inject({ method: 'GET', url: '/jobs/current', ...driver(SAM) });
    expect(current.json()).toMatchObject({ job: { id: acmeJob, reference: 'ACME-1' } });
    const position = await app.inject({
      method: 'POST',
      url: `/jobs/${acmeJob}/position`,
      payload: { location: { lat: 54.97, lon: -2.0 } },
      ...driver(SAM),
    });
    expect(position.statusCode).toBe(204);

    // Hours: Acme switches the feature on, Sam agrees to share, and a status is stored.
    const on = await app.inject({
      method: 'PUT',
      url: `/staff/hours/companies/${ACME}/settings`,
      payload: { enabled: true },
      ...staff(ACME_BOSS),
    });
    expect(on.statusCode).toBe(200);
    const agree = await app.inject({
      method: 'PUT',
      url: `/hours/sharing/${ACME}`,
      payload: { sharing: true },
      ...driver(SAM),
    });
    expect(agree.statusCode).toBe(200);
    const status = await app.inject({
      method: 'PUT',
      url: '/hours/status',
      payload: { state: 'driving', drivingLeftMin: 80, next: 'break' },
      ...driver(SAM),
    });
    expect(status.statusCode).toBe(204);
  });

  it('switches a paused company off for its drivers, and leaves the other firm alone', async () => {
    await setStatus(ACME, 'paused');

    // The job is hidden, with the firm's name so the app can say whose account it is.
    const current = await app.inject({ method: 'GET', url: '/jobs/current', ...driver(SAM) });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({ job: null, pausedCompany: 'Acme Haulage' });

    // No change to the job, and no position.
    const jobId = (
      await ownerPool.query<{ id: string }>(`select id from jobs.jobs where company_id = $1`, [
        ACME,
      ])
    ).rows[0]?.id;
    expect(jobId).toBeDefined();
    const advance = await app.inject({
      method: 'POST',
      url: `/jobs/${jobId}/status`,
      payload: { status: 'at_delivery' },
      ...driver(SAM),
    });
    expect(advance.statusCode).toBe(403);
    expect(advance.json()).toMatchObject({ tag: 'CompanyPaused', companyName: 'Acme Haulage' });
    const position = await app.inject({
      method: 'POST',
      url: `/jobs/${jobId}/position`,
      payload: { location: { lat: 54.97, lon: -1.9 } },
      ...driver(SAM),
    });
    expect(position.statusCode).toBe(403);

    // Hours: nothing is shared with a paused firm, and its office sees none; the driver can still stop sharing.
    const status = await app.inject({
      method: 'PUT',
      url: '/hours/status',
      payload: { state: 'driving', drivingLeftMin: 70, next: 'break' },
      ...driver(SAM),
    });
    expect(status.statusCode).toBe(409);
    const sharing = await app.inject({ method: 'GET', url: '/hours/sharing', ...driver(SAM) });
    expect(sharing.json()).toMatchObject({ companies: [{ companyId: ACME, firmEnabled: false }] });
    const office = await app.inject({
      method: 'GET',
      url: `/staff/hours/companies/${ACME}/status`,
      ...staff(ACME_BOSS),
    });
    expect(office.json()).toEqual({ statuses: [] });

    // The other firm's driver is untouched.
    const kim = await app.inject({ method: 'GET', url: '/jobs/current', ...driver(KIM) });
    expect(kim.json()).toMatchObject({ job: { reference: 'BETA-1' } });
  });

  it('brings everything back when the firm is active again, nothing having been deleted', async () => {
    await setStatus(ACME, 'active');

    const current = await app.inject({ method: 'GET', url: '/jobs/current', ...driver(SAM) });
    expect(current.json()).toMatchObject({ job: { reference: 'ACME-1', status: 'en_route' } });
    const sharing = await app.inject({ method: 'GET', url: '/hours/sharing', ...driver(SAM) });
    expect(sharing.json()).toMatchObject({
      companies: [{ companyId: ACME, firmEnabled: true, sharing: true }],
    });
    const status = await app.inject({
      method: 'PUT',
      url: '/hours/status',
      payload: { state: 'driving', drivingLeftMin: 60, next: 'break' },
      ...driver(SAM),
    });
    expect(status.statusCode).toBe(204);
  });
});
