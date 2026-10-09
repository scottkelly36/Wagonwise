import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFleetModule } from '../modules/fleet/api.js';
import { createMaintenanceModule, type StaffCaller } from '../modules/maintenance/api.js';
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
const LORRY = 'eeeeeeee-0000-4000-8000-000000000002';
const THEIRS = 'eeeeeeee-0000-4000-8000-000000000003';
const BOOKER = '50000000-0000-4000-8000-000000000001';
const DISPATCHER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';
const MOT = 'cccccccc-0000-4000-8000-000000000001';

const staff: Record<string, StaffCaller> = {
  [BOOKER]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_maintenance'] },
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_maintenance'] },
};

/**
 * Maintenance the way production runs it: the real `maintenance` and `fleet` modules, as `wagonwise_app`, inside real
 * `DataScopes` transactions with Row-Level Security on. What fakes cannot prove: the company's own staff can keep their
 * dates, another company's staff cannot reach any of it, and a vehicle shows with its registration.
 */
describe('maintenance end to end (real RLS, real scopes)', () => {
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
    await ownerPool.query(`
      insert into fleet.vehicles (id, company_id, name, registration, height_m, width_m, length_m, gross_weight_t)
        values ('${VAN}', '${ACME}', 'Big Van', 'AB12CDE', 3, 2, 6, 7),
               ('${LORRY}', '${ACME}', 'Big Wagon', null, 4, 2.5, 16, 44),
               ('${THEIRS}', '${BETA}', 'Rival Van', 'ZZ99ZZZ', 3, 2, 6, 7);
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
    const ids = new SequentialIdGenerator();

    const fleet = createFleetModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities: { getIdentifier: () => Promise.resolve(null) },
      companyNames: { namesFor: () => Promise.resolve(new Map()) },
      vehicleCapacity: { capacityFor: () => Promise.resolve(99) },
    });
    // Wired exactly as compose-core.ts does it.
    const maintenance = createMaintenanceModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      vehicles: {
        listForCompany: async (companyId) =>
          (await fleet.listCompanyVehicles(companyId)).map((v) => ({
            id: makeId<'FleetVehicleId'>(v.id),
            name: v.name,
            registration: v.registration,
          })),
        find: async (vehicleId) => {
          const v = await fleet.getVehicleSummary(vehicleId);
          return v === null
            ? null
            : {
                id: makeId<'FleetVehicleId'>(v.id),
                companyId: makeId<'CompanyId'>(v.companyId),
                name: v.name,
                registration: v.registration,
              };
        },
      },
    });

    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    maintenance.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const overview = (who: string, company = ACME) =>
    app.inject({
      method: 'GET',
      url: `/staff/maintenance/companies/${company}/overview`,
      ...as(who),
    });

  it('lets the person who books vehicles in create an MOT item for all vehicles', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/staff/maintenance/companies/${ACME}/items`,
      payload: {
        id: MOT,
        name: 'MOT',
        intervalValue: 12,
        intervalUnit: 'months',
        warnDays: 28,
        appliesTo: 'all',
        vehicleIds: [],
      },
      ...as(BOOKER),
    });
    expect(created.statusCode).toBe(201);
    const listed = await app.inject({
      method: 'GET',
      url: `/staff/maintenance/companies/${ACME}/items`,
      ...as(DISPATCHER),
    });
    expect(listed.json<{ items: { name: string }[] }>().items.map((i) => i.name)).toEqual(['MOT']);
  });

  it('shows every vehicle with the item, no date yet, and the registration where there is one', async () => {
    const response = await overview(DISPATCHER);
    expect(response.statusCode).toBe(200);
    const { rows } = response.json<{
      rows: { vehicleName: string; registration?: string; status: string }[];
    }>();
    expect(rows.map((r) => [r.vehicleName, r.registration, r.status])).toEqual([
      ['Big Van', 'AB12CDE', 'no_date'],
      ['Big Wagon', undefined, 'no_date'],
    ]);
  });

  it('sets a date, shows it overdue, then marks it done and moves it on a year with the history kept', async () => {
    const base = `/staff/maintenance/vehicles/${VAN}/items/${MOT}`;
    const set = await app.inject({
      method: 'PUT',
      url: `${base}/due`,
      payload: { dueDate: '2026-10-01' },
      ...as(BOOKER),
    });
    expect(set.statusCode).toBe(200);
    const late = (await overview(BOOKER)).json<{
      rows: { vehicleName: string; status: string; daysUntil: number }[];
    }>();
    expect(late.rows[0]).toMatchObject({
      vehicleName: 'Big Van',
      status: 'overdue',
      daysUntil: -8,
    });

    const done = await app.inject({
      method: 'POST',
      url: `${base}/done`,
      payload: { doneOn: '2026-10-08', note: 'Passed' },
      ...as(BOOKER),
    });
    expect(done.json()).toEqual({ dueDate: '2027-10-08', lastDone: '2026-10-08' });

    const vehicle = await app.inject({
      method: 'GET',
      url: `/staff/maintenance/vehicles/${VAN}`,
      ...as(DISPATCHER),
    });
    const body = vehicle.json<{
      rows: { status: string; dueDate: string; lastDone: string }[];
      history: { itemName: string; doneOn: string; nextDue: string; note: string }[];
    }>();
    expect(body.rows[0]).toMatchObject({
      status: 'ok',
      dueDate: '2027-10-08',
      lastDone: '2026-10-08',
    });
    expect(body.history).toMatchObject([
      { itemName: 'MOT', doneOn: '2026-10-08', nextDue: '2027-10-08', note: 'Passed' },
    ]);
  });

  it('keeps a dispatcher to reading: they may see the dates but not change them', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/staff/maintenance/vehicles/${VAN}/items/${MOT}/done`,
      payload: {},
      ...as(DISPATCHER),
    });
    expect(response.statusCode).toBe(403);
  });

  it('keeps another company out of all of it', async () => {
    expect((await overview(RIVAL)).statusCode).toBe(403);
    const vehicle = await app.inject({
      method: 'GET',
      url: `/staff/maintenance/vehicles/${VAN}`,
      ...as(RIVAL),
    });
    expect(vehicle.statusCode).toBe(404);
    const done = await app.inject({
      method: 'POST',
      url: `/staff/maintenance/vehicles/${VAN}/items/${MOT}/done`,
      payload: {},
      ...as(RIVAL),
    });
    expect(done.statusCode).toBe(404);
    // Nor can ACME's booker write to the rival's vehicle.
    const theirs = await app.inject({
      method: 'PUT',
      url: `/staff/maintenance/vehicles/${THEIRS}/items/${MOT}/due`,
      payload: { dueDate: '2027-01-01' },
      ...as(BOOKER),
    });
    expect(theirs.statusCode).toBe(404);
    const { rows } = await ownerPool.query('select count(*)::int as n from maintenance.schedules');
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('needs a sign-in', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/staff/maintenance/companies/${ACME}/overview` }))
        .statusCode,
    ).toBe(401);
  });
});
