import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCostingModule,
  type DeliveredJob,
  type StaffCaller,
} from '../modules/costing/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { makeId } from '../shared/brand.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const WAGON = 'eeeeeeee-0000-4000-8000-000000000001';
const TIPPER = 'eeeeeeee-0000-4000-8000-000000000002';
const SAM = 'd0000000-0000-4000-8000-000000000001';
const MONEY = '50000000-0000-4000-8000-000000000001';
const MANAGER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const staff: Record<string, StaffCaller> = {
  [MONEY]: {
    kind: 'fleet',
    companyId: ACME as never,
    privileges: ['manage_billing', 'manage_fleet'],
  },
  [MANAGER]: {
    kind: 'fleet',
    companyId: ACME as never,
    privileges: ['manage_fleet', 'view_reports'],
  },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_billing'] },
};

const at = (iso: string) => new Date(iso);
const delivered: DeliveredJob[] = [
  {
    id: 'job-1',
    reference: 'JOB-1',
    customer: 'Acme Ltd',
    pricePence: 20_000,
    vehicleId: makeId<'FleetVehicleId'>(WAGON),
    driverId: makeId<'DriverId'>(SAM),
    acceptedAt: at('2026-10-10T08:00:00Z'),
    deliveredAt: at('2026-10-10T10:00:00Z'),
  },
  {
    id: 'job-2',
    reference: 'JOB-2',
    customer: 'Acme Ltd',
    pricePence: 40_000,
    vehicleId: makeId<'FleetVehicleId'>(WAGON),
    driverId: makeId<'DriverId'>(SAM),
    acceptedAt: at('2026-10-12T09:00:00Z'),
    deliveredAt: at('2026-10-12T15:00:00Z'),
  },
];

/**
 * The cost of a month's jobs on real Postgres: the fuel imported, the running costs and the driver's rate entered through the
 * real routes, and the jobs from a fixed list. The numbers are the ones the unit test works out by hand.
 */
describe('job costs end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
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
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });
    const vehicles = [
      { id: makeId<'FleetVehicleId'>(WAGON), name: 'Big Wagon', registration: 'AB12CDE' },
      { id: makeId<'FleetVehicleId'>(TIPPER), name: 'Tipper', registration: 'TP11 PER' },
    ];
    const costing = createCostingModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-11-02T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      jobs: { deliveredBetween: (c) => Promise.resolve(c === ACME ? delivered : []) },
      drivers: {
        listForCompany: (c) =>
          Promise.resolve(
            c === ACME ? [{ id: makeId<'DriverId'>(SAM), name: 'sam@example.com' }] : [],
          ),
        belongsToCompany: (d, c) => Promise.resolve(d === SAM && c === ACME),
      },
      vehicles: {
        listForCompany: (c) => Promise.resolve(c === ACME ? vehicles : []),
        find: (v) => {
          const found = vehicles.find((x) => x.id === v);
          return Promise.resolve(
            found === undefined ? null : { ...found, companyId: makeId<'CompanyId'>(ACME) },
          );
        },
      },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    costing.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, payload, ...as(MONEY) });
  const report = (who: string, month = '2026-10', company = ACME) =>
    app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${company}/job-costs?month=${month}`,
      ...as(who),
    });

  it('is empty before anything is entered, apart from the jobs themselves', async () => {
    const response = await report(MONEY);
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      totals: { jobs: number; revenuePence: number; profitPence: number; jobsWithoutRate: number };
    }>();
    expect(body.totals).toMatchObject({
      jobs: 2,
      revenuePence: 60_000,
      profitPence: 60_000,
      jobsWithoutRate: 2,
    });
  });

  it('works out each job’s cost from the fuel, running costs and rate entered through the real routes', async () => {
    // Fuel: £160 for the wagon, £50 for the tipper (which did no job), £20 that matches no vehicle.
    const imported = await post(`/staff/costing/companies/${ACME}/fuel/import`, {
      fileName: 'oct.csv',
      rows: [
        {
          occurredAt: '2026-10-05T08:00:00.000Z',
          registration: 'AB12 CDE',
          litres: 100,
          amountPence: 16_000,
        },
        {
          occurredAt: '2026-10-06T08:00:00.000Z',
          registration: 'TP11 PER',
          litres: 30,
          amountPence: 5_000,
        },
        {
          occurredAt: '2026-10-07T08:00:00.000Z',
          registration: 'ZZ99 ZZZ',
          litres: 12,
          amountPence: 2_000,
        },
        // September's fuel is not October's.
        {
          occurredAt: '2026-09-30T08:00:00.000Z',
          registration: 'AB12 CDE',
          litres: 80,
          amountPence: 99_000,
        },
      ],
    });
    expect(imported.statusCode).toBe(200);
    for (const cost of [
      { vehicleId: WAGON, description: 'Insurance', monthlyPence: 18_000, fromMonth: '2026-01' },
      { vehicleId: WAGON, description: 'Finance', monthlyPence: 30_000, fromMonth: '2026-01' },
      { vehicleId: TIPPER, description: 'Insurance', monthlyPence: 10_000, fromMonth: '2026-01' },
      { description: 'Office rent', monthlyPence: 40_000, fromMonth: '2026-01' },
    ]) {
      expect((await post(`/staff/costing/companies/${ACME}/running-costs`, cost)).statusCode).toBe(
        201,
      );
    }
    const rate = await app.inject({
      method: 'PUT',
      url: `/staff/costing/companies/${ACME}/driver-rates`,
      payload: { driverId: SAM, hourlyPence: 1_500, fromDay: '2026-01-01' },
      ...as(MONEY),
    });
    expect(rate.statusCode).toBe(200);

    const response = await report(MONEY);
    const body = response.json<{
      jobs: {
        reference: string;
        costPence: number;
        profitPence: number;
        wagesPence: number;
        fuelPence: number;
        runningPence: number;
      }[];
      vehicles: { name: string; costPence: number; profitPence: number }[];
      customers: { name: string; revenuePence: number; costPence: number }[];
      totals: Record<string, number>;
    }>();
    const byRef = new Map(body.jobs.map((j) => [j.reference, j]));
    expect(byRef.get('JOB-1')).toMatchObject({
      wagesPence: 3_000,
      fuelPence: 4_000,
      runningPence: 12_000,
      costPence: 19_000,
      profitPence: 1_000,
    });
    expect(byRef.get('JOB-2')).toMatchObject({
      wagesPence: 9_000,
      fuelPence: 12_000,
      runningPence: 36_000,
      costPence: 57_000,
      profitPence: -17_000,
    });
    expect(body.vehicles.map((v) => [v.name, v.costPence, v.profitPence])).toEqual([
      ['Big Wagon', 76_000, -16_000],
      ['Tipper', 15_000, -15_000],
    ]);
    expect(body.customers).toEqual([
      { name: 'Acme Ltd', jobs: 2, revenuePence: 60_000, costPence: 76_000, profitPence: -16_000 },
    ]);
    expect(body.totals).toMatchObject({
      revenuePence: 60_000,
      wagesPence: 12_000,
      fuelPence: 23_000,
      unmatchedFuelPence: 2_000,
      runningPence: 58_000,
      overheadsPence: 40_000,
      jobsCostPence: 76_000,
      notCoveredPence: 17_000,
      profitPence: -73_000,
      jobsWithoutRate: 0,
    });
  });

  it('is for the money person only, and another company sees nothing of it', async () => {
    expect((await report(MANAGER)).statusCode).toBe(403);
    expect((await report(RIVAL, '2026-10', ACME)).statusCode).toBe(403);
    const theirs = await report(RIVAL, '2026-10', BETA);
    expect(theirs.json()).toMatchObject({ jobs: [], totals: { jobs: 0, profitPence: 0 } });
    expect((await report(MONEY, '2026-13')).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/staff/costing/companies/${ACME}/job-costs?month=2026-10`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('counts only the month asked for', async () => {
    const september = (await report(MONEY, '2026-09')).json<{
      totals: { fuelPence: number; jobs: number };
    }>();
    expect(september.totals).toMatchObject({ fuelPence: 99_000 });
  });
});
