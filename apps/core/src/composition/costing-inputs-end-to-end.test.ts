import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCostingModule, type StaffCaller } from '../modules/costing/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { makeId } from '../shared/brand.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const VAN = 'eeeeeeee-0000-4000-8000-000000000001';
const THEIRS = 'eeeeeeee-0000-4000-8000-000000000003';
const SAM = 'd0000000-0000-4000-8000-000000000001';
const MONEY = '50000000-0000-4000-8000-000000000001';
const MANAGER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const staff: Record<string, StaffCaller> = {
  [MONEY]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_billing'] },
  [MANAGER]: {
    kind: 'fleet',
    companyId: ACME as never,
    privileges: ['manage_fleet', 'view_reports'],
  },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_billing'] },
};

/**
 * Running costs and what drivers are paid, on real Postgres with Row-Level Security: only the firm's money person reaches
 * them, a change from a later month keeps the earlier months as they were, and another company sees none of it.
 */
describe('costing inputs end to end (real RLS, real scopes)', () => {
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
    const costing = createCostingModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-09T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      jobs: { deliveredBetween: () => Promise.resolve([]) },
      drivers: {
        listForCompany: (c) =>
          Promise.resolve(
            c === ACME ? [{ id: makeId<'DriverId'>(SAM), name: 'sam@example.com' }] : [],
          ),
        belongsToCompany: (d, c) => Promise.resolve(d === SAM && c === ACME),
      },
      vehicles: {
        listForCompany: () => Promise.resolve([]),
        find: (v) =>
          Promise.resolve(
            v === VAN
              ? {
                  id: makeId<'FleetVehicleId'>(VAN),
                  name: 'Van',
                  registration: undefined,
                  companyId: makeId<'CompanyId'>(ACME),
                }
              : v === THEIRS
                ? {
                    id: makeId<'FleetVehicleId'>(THEIRS),
                    name: 'Theirs',
                    registration: undefined,
                    companyId: makeId<'CompanyId'>(BETA),
                  }
                : null,
          ),
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
  const list = (who: string, company = ACME) =>
    app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${company}/running-costs`,
      ...as(who),
    });
  const add = (who: string, payload: object, company = ACME) =>
    app.inject({
      method: 'POST',
      url: `/staff/costing/companies/${company}/running-costs`,
      payload,
      ...as(who),
    });
  const monthly = async () =>
    (
      await ownerPool.query<{
        description: string;
        monthly_pence: string;
        from_month: string;
        to_month: string | null;
      }>(
        `select description, monthly_pence, from_month, to_month from costing.running_costs order by from_month, description`,
      )
    ).rows;

  let insuranceId = '';

  it('adds a cost for a vehicle and one for the firm, for the money person only', async () => {
    const insurance = await add(MONEY, {
      vehicleId: VAN,
      description: 'Insurance',
      monthlyPence: 18_000,
      fromMonth: '2026-04',
    });
    expect(insurance.statusCode).toBe(201);
    insuranceId = insurance.json<{ id: string }>().id;
    expect(
      (await add(MONEY, { description: 'Office rent', monthlyPence: 40_000, fromMonth: '2026-04' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await add(MANAGER, { description: 'Nope', monthlyPence: 1, fromMonth: '2026-04' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await add(MONEY, {
          vehicleId: THEIRS,
          description: 'Theirs',
          monthlyPence: 1,
          fromMonth: '2026-04',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await add(MONEY, { description: 'Bad', monthlyPence: -1, fromMonth: '2026-04' })).statusCode,
    ).toBe(400);
    const seen = (await list(MONEY)).json<{
      costs: { description: string; vehicleId?: string }[];
    }>().costs;
    expect(seen.map((c) => c.description).sort()).toEqual(['Insurance', 'Office rent']);
    expect((await list(MANAGER)).statusCode).toBe(403);
  });

  it('changes from a later month without rewriting the months before it', async () => {
    const change = await app.inject({
      method: 'POST',
      url: `/staff/costing/running-costs/${insuranceId}/change`,
      payload: { description: 'Insurance', monthlyPence: 21_000, fromMonth: '2026-10' },
      ...as(MONEY),
    });
    expect(change.statusCode).toBe(200);
    const rows = (await monthly()).filter((r) => r.description === 'Insurance');
    expect(rows).toEqual([
      {
        description: 'Insurance',
        monthly_pence: '18000',
        from_month: '2026-04',
        to_month: '2026-09',
      },
      { description: 'Insurance', monthly_pence: '21000', from_month: '2026-10', to_month: null },
    ]);
  });

  it('stops a cost the month before, and keeps another company out of all of it', async () => {
    const stop = (who: string) =>
      app.inject({
        method: 'POST',
        url: `/staff/costing/running-costs/${insuranceId}/stop`,
        payload: { fromMonth: '2026-12' },
        ...as(who),
      });
    expect((await stop(RIVAL)).statusCode).toBe(404);
    expect((await stop(MANAGER)).statusCode).toBe(403);
    // The cost entered above ran from 2026-04 and was split at 2026-10; stop the first (ended) row's successor.
    const rows = await ownerPool.query<{ id: string }>(
      `select id from costing.running_costs where description = 'Insurance' and to_month is null`,
    );
    const open = rows.rows[0]?.id ?? '';
    const stopOpen = await app.inject({
      method: 'POST',
      url: `/staff/costing/running-costs/${open}/stop`,
      payload: { fromMonth: '2026-12' },
      ...as(MONEY),
    });
    expect(stopOpen.statusCode).toBe(204);
    expect((await monthly()).find((r) => r.monthly_pence === '21000')?.to_month).toBe('2026-11');
    expect((await list(RIVAL, ACME)).statusCode).toBe(403);
    expect((await list(RIVAL, BETA)).json()).toEqual({ costs: [] });
  });

  it('sets a driver’s hourly rate from a day, lists the rates newest first, and replaces one on the same day', async () => {
    const put = (who: string, payload: object) =>
      app.inject({
        method: 'PUT',
        url: `/staff/costing/companies/${ACME}/driver-rates`,
        payload,
        ...as(who),
      });
    expect(
      (await put(MONEY, { driverId: SAM, hourlyPence: 1_200, fromDay: '2026-01-01' })).statusCode,
    ).toBe(200);
    expect(
      (await put(MONEY, { driverId: SAM, hourlyPence: 1_350, fromDay: '2026-07-01' })).statusCode,
    ).toBe(200);
    expect(
      (await put(MONEY, { driverId: SAM, hourlyPence: 1_400, fromDay: '2026-07-01' })).statusCode,
    ).toBe(200);
    expect(
      (await put(MANAGER, { driverId: SAM, hourlyPence: 1, fromDay: '2026-07-01' })).statusCode,
    ).toBe(403);
    expect(
      (await put(MONEY, { driverId: 'someone-else', hourlyPence: 1_200, fromDay: '2026-01-01' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await put(MONEY, { driverId: SAM, hourlyPence: 0, fromDay: '2026-01-01' })).statusCode,
    ).toBe(400);
    const listed = await app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${ACME}/driver-rates`,
      ...as(MONEY),
    });
    const drivers = listed.json<{
      drivers: { name: string; rates: { hourlyPence: number; fromDay: string }[] }[];
    }>().drivers;
    expect(drivers).toHaveLength(1);
    expect(drivers[0]?.name).toBe('sam@example.com');
    expect(drivers[0]?.rates.map((r) => [r.fromDay, r.hourlyPence])).toEqual([
      ['2026-07-01', 1_400],
      ['2026-01-01', 1_200],
    ]);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/staff/costing/companies/${ACME}/driver-rates`,
          ...as(MANAGER),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('deletes a rate entered by mistake, but not another company’s', async () => {
    const id =
      (await ownerPool.query<{ id: string }>(`select id from costing.driver_rates limit 1`)).rows[0]
        ?.id ?? '';
    const del = (who: string) =>
      app.inject({ method: 'DELETE', url: `/staff/costing/driver-rates/${id}`, ...as(who) });
    expect((await del(RIVAL)).statusCode).toBe(404);
    expect((await del(MONEY)).statusCode).toBe(204);
    expect(
      (
        (await ownerPool.query(`select count(*)::int as n from costing.driver_rates`)).rows[0] as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });
});
