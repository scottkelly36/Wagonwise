import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createChecksModule, type StaffCaller } from '../modules/checks/api.js';
import { createFleetModule } from '../modules/fleet/api.js';
import { createJobsModule, type Caller } from '../modules/jobs/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { makeId } from '../shared/brand.js';
import { err, ok } from '../shared/result.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const PAT = 'dddddddd-0000-4000-8000-000000000001'; // an active driver of ACME, on a job
const SAM = 'dddddddd-0000-4000-8000-000000000002'; // an active driver of ACME, no job
const OUTSIDER = 'dddddddd-0000-4000-8000-000000000003'; // drives for BETA
const LORRY = 'eeeeeeee-0000-4000-8000-000000000001';
const CHECK = 'cccccccc-0000-4000-8000-000000000001';
const LIST = 'aaaaaaaa-0000-4000-8000-000000000001';

const dispatchers: Record<string, Caller> = {
  dispatcher: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
};
const builders: Record<string, StaffCaller> = {
  builder: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_fleet'] },
};

const stops = [
  { kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } },
  { kind: 'delivery', name: 'Port', location: { lat: 54.97, lon: -1.6 } },
];

const list = {
  id: LIST,
  name: 'Tractor unit',
  appliesTo: 'all',
  vehicleIds: [],
  items: [
    {
      id: 'tyres',
      kind: 'pass_fail',
      label: 'Tyres',
      required: true,
      severity: 'do_not_drive',
      photoOnDefect: true,
    },
    { id: 'notes', kind: 'note', label: 'Anything else?', required: false },
  ],
};

/**
 * Walk-round checks the way production runs them: the real `checks`, `jobs` and `fleet` modules, as `wagonwise_app`,
 * inside real `DataScopes` transactions with Row-Level Security on. The part fakes cannot prove is that a driver,
 * with only a driver scope, can find the vehicle on their job, read the company's lists, file a check and a
 * photo, and see that it is done, while another company's driver cannot.
 */
describe('walk-round checks end to end (real RLS, real scopes)', () => {
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
      insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
        values ('${LORRY}', '${ACME}', 'Big Wagon', 4, 2.5, 16, 44);
      insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
        values ('f1000000-0000-4000-8000-000000000001', '${ACME}', '${PAT}', 'active', now(), now()),
               ('f1000000-0000-4000-8000-000000000002', '${ACME}', '${SAM}', 'active', now(), now()),
               ('f1000000-0000-4000-8000-000000000003', '${BETA}', '${OUTSIDER}', 'active', now(), now());
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
    const identifiers: Record<string, string> = {
      [PAT]: 'pat@example.com',
      [SAM]: 'sam@example.com',
      [OUTSIDER]: 'out@example.com',
    };
    const driverIdentities = {
      getIdentifier: (id: string) => Promise.resolve(identifiers[id] ?? null),
    };

    const fleet = createFleetModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities,
      companyNames: { namesFor: () => Promise.resolve(new Map()) },
      vehicleCapacity: { capacityFor: () => Promise.resolve(99) },
    });
    const jobs = createJobsModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(dispatchers[staffId] ?? null) },
      drivers: { belongsToCompany: (id, company) => fleet.isActiveDriverOfCompany(id, company) },
      vehicles: {
        belongsToCompany: (id, company) => Promise.resolve(id === LORRY && company === ACME),
      },
      vehicleNames: { getName: () => Promise.resolve(null) },
      routes: {
        estimate: () =>
          Promise.resolve(ok({ distanceKm: 40, durationMin: 50, geometry: 'a-line' })),
      },
      navigationProfiles: { provision: () => Promise.resolve(err({ tag: 'VehicleUnavailable' })) },
      driverIdentities,
    });
    // Wired exactly as compose-core.ts does it.
    const checks = createChecksModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(builders[staffId] ?? null) },
      vehicles: {
        belongsToCompany: async (vehicleId, companyId) =>
          (await fleet.getVehicleCompanyId(vehicleId)) === companyId,
        find: async (vehicleId) => {
          const [companyId, vehicle] = await Promise.all([
            fleet.getVehicleCompanyId(vehicleId),
            fleet.getVehicle(vehicleId),
          ]);
          return companyId === null || vehicle === null
            ? null
            : { companyId: makeId<'CompanyId'>(companyId), name: vehicle.name };
        },
      },
      driverVehicle: {
        currentVehicle: async (driverId) => {
          const vehicleId = await jobs.activeVehicleFor(driverId);
          if (vehicleId === null) return null;
          const [companyId, vehicle] = await Promise.all([
            fleet.getVehicleCompanyId(vehicleId),
            fleet.getVehicle(vehicleId),
          ]);
          return companyId === null || vehicle === null
            ? null
            : {
                id: makeId<'FleetVehicleId'>(vehicleId),
                companyId: makeId<'CompanyId'>(companyId),
                name: vehicle.name,
              };
        },
      },
      membership: {
        isActiveDriverOfCompany: (driverId, companyId) =>
          fleet.isActiveDriverOfCompany(driverId, companyId),
      },
      driverIdentities,
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
    checks.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const asStaff = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const asDriver = (id: string) => ({ headers: { 'x-test-driver-id': id } });
  const submit = (driver: string, answers: unknown[], id = CHECK) =>
    app.inject({
      method: 'POST',
      url: '/checks',
      payload: { id, templateId: LIST, vehicleId: LORRY, answers },
      ...asDriver(driver),
    });

  it('sets up: a company builds a list, and dispatch puts Pat on a job with the lorry', async () => {
    const built = await app.inject({
      method: 'POST',
      url: `/staff/checks/companies/${ACME}/templates`,
      payload: list,
      ...asStaff('builder'),
    });
    expect(built.statusCode).toBe(201);

    const created = await app.inject({
      method: 'POST',
      url: `/staff/jobs/companies/${ACME}/jobs`,
      payload: { companyId: ACME, reference: 'CHK-1', stops },
      ...asStaff('dispatcher'),
    });
    const { id } = created.json<{ id: string }>();
    const assigned = await app.inject({
      method: 'POST',
      url: `/staff/jobs/${id}/assign`,
      payload: { driverId: PAT, vehicleId: LORRY },
      ...asStaff('dispatcher'),
    });
    expect(assigned.statusCode).toBe(200);
  });

  it('shows Pat the lists for the lorry on their job, not done yet; a driver with no job has none', async () => {
    const mine = await app.inject({ method: 'GET', url: '/checks/mine', ...asDriver(PAT) });
    expect(mine.statusCode).toBe(200);
    const body = mine.json<{
      vehicle: { id: string; name: string } | null;
      lists: { template: { name: string }; doneToday: boolean }[];
    }>();
    expect(body.vehicle).toEqual({ id: LORRY, name: 'Big Wagon' });
    expect(body.lists.map((l) => [l.template.name, l.doneToday])).toEqual([
      ['Tractor unit', false],
    ]);

    const none = await app.inject({ method: 'GET', url: '/checks/mine', ...asDriver(SAM) });
    expect(none.json()).toEqual({ vehicle: null, lists: [] });
  });

  it('files Pat’s check with a defect, then a photo for it, and a retry changes nothing', async () => {
    const answers = [{ itemId: 'tyres', value: 'defect', note: 'Nearside front is bald' }];
    const filed = await submit(PAT, answers);
    expect(filed.statusCode).toBe(201);
    expect(filed.json()).toMatchObject({
      result: 'do_not_drive',
      defects: [{ itemId: 'tyres', severity: 'do_not_drive' }],
    });

    const photo = await app.inject({
      method: 'PUT',
      url: `/checks/${CHECK}/photos/tyres`,
      payload: { contentType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') },
      ...asDriver(PAT),
    });
    expect(photo.statusCode).toBe(204);

    const retry = await submit(PAT, answers);
    expect(retry.statusCode).toBe(201);

    const { rows: defects } = await ownerPool.query(
      'select item_id, status, note, vehicle_name from checks.defects where check_id = $1',
      [CHECK],
    );
    expect(defects).toEqual([
      {
        item_id: 'tyres',
        status: 'open',
        note: 'Nearside front is bald',
        vehicle_name: 'Big Wagon',
      },
    ]);
    const { rows: photos } = await ownerPool.query(
      "select convert_from(data, 'utf8') as text from checks.check_photos where check_id = $1",
      [CHECK],
    );
    expect(photos).toEqual([{ text: 'a photo' }]);
  });

  it('then shows the list as done today, to Pat', async () => {
    const mine = await app.inject({ method: 'GET', url: '/checks/mine', ...asDriver(PAT) });
    expect(mine.json<{ lists: { doneToday: boolean }[] }>().lists[0]?.doneToday).toBe(true);
  });

  it('keeps another company’s driver out: no lists, no filing, no photos on Pat’s check', async () => {
    const mine = await app.inject({ method: 'GET', url: '/checks/mine', ...asDriver(OUTSIDER) });
    expect(mine.json()).toEqual({ vehicle: null, lists: [] });

    const filed = await submit(
      OUTSIDER,
      [{ itemId: 'tyres', value: 'ok' }],
      'cccccccc-0000-4000-8000-000000000002',
    );
    // Their company's database view cannot even see the list, so it is simply not found: nothing leaks.
    expect(filed.statusCode).toBe(404);

    const photo = await app.inject({
      method: 'PUT',
      url: `/checks/${CHECK}/photos/tyres`,
      payload: { contentType: 'image/jpeg', dataBase64: Buffer.from('theirs').toString('base64') },
      ...asDriver(OUTSIDER),
    });
    expect(photo.statusCode).toBe(404);
  });

  it('refuses a colleague filing against Pat’s check id, and answers that do not fit the questions', async () => {
    expect((await submit(SAM, [{ itemId: 'tyres', value: 'ok' }])).statusCode).toBe(403);
    const bad = await submit(
      PAT,
      [{ itemId: 'tyres', value: 'fine' }],
      'cccccccc-0000-4000-8000-000000000003',
    );
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ tag: 'InvalidAnswers' });
  });

  it('needs a driver sign-in', async () => {
    expect((await app.inject({ method: 'GET', url: '/checks/mine' })).statusCode).toBe(401);
  });
});
