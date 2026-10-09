import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createChecksModule, type ChecksModule } from '../modules/checks/api.js';
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
const LORRY = 'eeeeeeee-0000-4000-8000-000000000001';
const CHECK = 'cccccccc-0000-4000-8000-000000000001';
const TEMPLATE = 'aaaaaaaa-0000-4000-8000-000000000001';
const D_STOP = 'dddddddd-0000-4000-8000-000000000001'; // a "do not drive" defect
const D_SOON = 'dddddddd-0000-4000-8000-000000000002'; // a "fix soon" defect
const BOOKER = '50000000-0000-4000-8000-000000000001';
const DISPATCHER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const staff: Record<string, StaffCaller> = {
  [BOOKER]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_maintenance'] },
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_maintenance'] },
};

/**
 * Defects into repairs, with the real `checks`, `maintenance` and `fleet` modules on real Postgres with Row-Level
 * Security: the person who books repairs holds only `manage_maintenance`, yet booking marks the defect seen and finishing
 * marks it fixed, and that is what releases a vehicle a firm holds back for a "do not drive" defect.
 */
describe('repairs end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let checks: ChecksModule;
  let scopes: PostgresDataScopes;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    await ownerPool.query(`
      insert into fleet.vehicles (id, company_id, name, registration, height_m, width_m, length_m, gross_weight_t)
        values ('${LORRY}', '${ACME}', 'Big Wagon', 'AB12CDE', 4, 2.5, 16, 44);
      insert into checks.checks
        (id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name, driver_id,
         check_day, items, answers, result, submitted_at)
        values ('${CHECK}', '${ACME}', '${TEMPLATE}', 1, 'Tractor unit', '${LORRY}', 'Big Wagon',
                'd0000000-0000-4000-8000-000000000001', '2026-10-09', '[]', '[]', 'do_not_drive', now());
      insert into checks.defects (id, check_id, company_id, vehicle_id, vehicle_name, item_id, label, severity, detail, created_at)
        values ('${D_STOP}', '${CHECK}', '${ACME}', '${LORRY}', 'Big Wagon', 'tyres', 'Tyres', 'do_not_drive', 'Flagged as a defect', now()),
               ('${D_SOON}', '${CHECK}', '${ACME}', '${LORRY}', 'Big Wagon', 'wipers', 'Wipers', 'advisory', 'Flagged as a defect', now());
      insert into checks.settings (company_id, required_before_job, block_on_do_not_drive)
        values ('${ACME}', false, true);
    `);

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined);
    scopes = new PostgresDataScopes(appPool);
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
    checks = createChecksModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      vehicles: {
        belongsToCompany: async (v, c) => (await fleet.getVehicleCompanyId(v)) === c,
        find: () => Promise.resolve(null),
      },
      driverVehicle: { currentVehicle: () => Promise.resolve(null) },
      membership: { isActiveDriverOfCompany: () => Promise.resolve(false) },
      driverIdentities: { getIdentifier: () => Promise.resolve(null) },
    });
    // Wired exactly as compose-core.ts does it.
    const maintenance = createMaintenanceModule({
      db,
      ids,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      mailer: { send: () => Promise.resolve() },
      dashboardUrl: undefined,
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
      defects: {
        find: async (defectId) => {
          const d = await checks.findDefect(defectId);
          return d === null
            ? null
            : {
                id: d.id,
                companyId: makeId<'CompanyId'>(d.companyId),
                vehicleId: d.vehicleId,
                vehicleName: d.vehicleName,
                label: d.label,
                detail: d.detail,
                severity: d.severity,
                status: d.status,
              };
        },
        setStatus: (defectId, status, staffId) => checks.setDefectStatus(defectId, status, staffId),
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
  const statusOf = async (defectId: string) =>
    (
      await ownerPool.query<{ status: string }>('select status from checks.defects where id = $1', [
        defectId,
      ])
    ).rows[0]?.status;
  const verdict = () =>
    scopes.run({ kind: 'company', companyId: ACME }, () => checks.jobStartVerdict(ACME, LORRY));
  const book = (who: string, defectId: string, dueDate = '2026-10-14') =>
    app.inject({
      method: 'POST',
      url: '/staff/maintenance/repairs',
      payload: { defectId, dueDate },
      ...as(who),
    });

  it('starts with the lorry held back for the "do not drive" defect', async () => {
    expect(await verdict()).toBe('vehicle_not_fit');
    expect(await statusOf(D_STOP)).toBe('open');
  });

  it('lets the person who books repairs book one, which marks the defect seen but does not release the lorry', async () => {
    const response = await book(BOOKER, D_STOP);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      defectId: D_STOP,
      vehicleName: 'Big Wagon',
      title: 'Tyres: Flagged as a defect',
      severity: 'do_not_drive',
      dueDate: '2026-10-14',
      status: 'open',
      daysLeft: 5,
      overdue: false,
    });
    expect(await statusOf(D_STOP)).toBe('acknowledged');
    expect(await verdict()).toBe('vehicle_not_fit');
  });

  it('answers booking again with the repair already booked', async () => {
    const first = (await book(BOOKER, D_STOP)).json<{ id: string; dueDate: string }>();
    const again = (await book(BOOKER, D_STOP, '2026-10-30')).json<{
      id: string;
      dueDate: string;
    }>();
    expect(again.id).toBe(first.id);
    expect(again.dueDate).toBe('2026-10-14');
    const { rows } = await ownerPool.query('select count(*)::int as n from maintenance.repairs');
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('keeps others out: a dispatcher cannot book, and another company cannot see the defect', async () => {
    expect((await book(DISPATCHER, D_SOON)).statusCode).toBe(403);
    expect((await book(RIVAL, D_SOON)).statusCode).toBe(404);
    const list = await app.inject({
      method: 'GET',
      url: `/staff/maintenance/companies/${ACME}/repairs`,
      ...as(RIVAL),
    });
    expect(list.statusCode).toBe(403);
    const seen = await app.inject({
      method: 'GET',
      url: `/staff/maintenance/companies/${ACME}/repairs`,
      ...as(DISPATCHER),
    });
    expect(seen.json<{ repairs: unknown[] }>().repairs).toHaveLength(1);
  });

  it('finishing the repair marks the defect fixed, which releases the lorry', async () => {
    const id = (
      await app.inject({
        method: 'GET',
        url: `/staff/maintenance/companies/${ACME}/repairs`,
        ...as(BOOKER),
      })
    ).json<{ repairs: { id: string }[] }>().repairs[0]?.id;
    const done = await app.inject({
      method: 'POST',
      url: `/staff/maintenance/repairs/${id}/done`,
      payload: { doneOn: '2026-10-09', note: 'New tyre fitted', markDefectFixed: true },
      ...as(BOOKER),
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      status: 'done',
      doneOn: '2026-10-09',
      note: 'New tyre fitted',
    });
    expect(await statusOf(D_STOP)).toBe('fixed');
    expect(await verdict()).toBe('ok');
    const { rows } = await ownerPool.query<{ status_changed_by: string }>(
      'select status_changed_by from checks.defects where id = $1',
      [D_STOP],
    );
    expect(rows[0]?.status_changed_by).toBe(BOOKER);

    const again = await app.inject({
      method: 'POST',
      url: `/staff/maintenance/repairs/${id}/done`,
      payload: { markDefectFixed: true },
      ...as(BOOKER),
    });
    expect(again.statusCode).toBe(409);
  });

  it('can finish a repair and leave the defect open, and can cancel one booked in error', async () => {
    const booked = (await book(BOOKER, D_SOON)).json<{ id: string }>();
    expect(await statusOf(D_SOON)).toBe('acknowledged');
    await app.inject({
      method: 'POST',
      url: `/staff/maintenance/repairs/${booked.id}/done`,
      payload: { markDefectFixed: false },
      ...as(BOOKER),
    });
    expect(await statusOf(D_SOON)).toBe('acknowledged');

    const second = (await book(BOOKER, D_SOON)).json<{ id: string }>();
    const cancelled = await app.inject({
      method: 'DELETE',
      url: `/staff/maintenance/repairs/${second.id}`,
      ...as(BOOKER),
    });
    expect(cancelled.statusCode).toBe(204);
    expect(await statusOf(D_SOON)).toBe('acknowledged');
  });

  it('will not book a repair for a defect that is already fixed', async () => {
    const response = await book(BOOKER, D_STOP);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ tag: 'DefectAlreadyFixed' });
  });
});
