import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditModule, type StaffCaller } from '../modules/audit/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const VEHICLE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DRIVER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OFFICE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TEMPLATE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ADMIN = '50000000-0000-4000-8000-000000000001';
const A_REPORTS = '50000000-0000-4000-8000-000000000002';
const A_MAINTENANCE_ONLY = '50000000-0000-4000-8000-000000000003';
const B_REPORTS = '50000000-0000-4000-8000-000000000004';
const staff: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [A_REPORTS]: { kind: 'fleet', companyId: COMPANY_A, privileges: ['view_reports'] },
  [A_MAINTENANCE_ONLY]: { kind: 'fleet', companyId: COMPANY_A, privileges: ['manage_maintenance'] },
  [B_REPORTS]: { kind: 'fleet', companyId: COMPANY_B, privileges: ['view_reports'] },
};

interface Pack {
  vehicle: { name: string; registration?: string; company?: string };
  range: { from: string; to: string };
  summary: Record<string, number>;
  checks: { day: string; who: string; result: string; defects: number }[];
  defects: {
    id: string;
    item: string;
    status: string;
    foundBy: string;
    lastChangeBy?: string;
    history: { status: string; at: string; by?: string }[];
    repair?: { title: string; status: string; doneOn?: string; finishedBy?: string };
  }[];
  maintenance: {
    items: { name: string; dueDate: string; lastDone?: string; state: string }[];
    done: { item: string; doneOn: string; nextDue: string; by?: string }[];
    changes: { item: string; from?: string; to: string; at: string; by?: string }[];
  };
  timeline: { at: string; kind: string; title: string; who?: string }[];
}

/**
 * The vehicle audit pack on real Postgres with Row-Level Security: the SQL reads each context's tables, dates come out as the
 * same day wherever the server runs, a company sees its own vehicle only, and the staff names are looked up outside the
 * read's data scope (the real scopes refuse a scope inside a scope).
 */
describe('audit pack end to end (real RLS, real scopes)', () => {
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

    const vehicle = (id: string, companyId: string, name: string, reg: string) =>
      ownerPool.query(
        `insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t, registration)
         values ($1, $2, $3, 4, 2.55, 16.5, 44, $4)`,
        [id, companyId, name, reg],
      );
    await vehicle(VEHICLE_A, COMPANY_A, 'Scania R450', 'NX21ABC');
    await vehicle(VEHICLE_B, COMPANY_B, 'Volvo FH', 'BD22XYZ');

    const check = (
      id: string,
      companyId: string,
      vehicleId: string,
      day: string,
      at: string,
      result: string,
    ) =>
      ownerPool.query(
        `insert into checks.checks (id, company_id, template_id, template_version, template_name, vehicle_id,
                                    vehicle_name, driver_id, check_day, items, answers, result, submitted_at)
         values ($1, $2, $3, 3, 'Daily walk-round', $4, 'x', $5, $6, '[]', '{}', $7, $8)`,
        [id, companyId, TEMPLATE, vehicleId, DRIVER, day, result, at],
      );
    await check(
      'c0000000-0000-4000-8000-000000000001',
      COMPANY_A,
      VEHICLE_A,
      '2026-11-02',
      '2026-11-02T06:30:00Z',
      'clear',
    );
    await check(
      'c0000000-0000-4000-8000-000000000002',
      COMPANY_A,
      VEHICLE_A,
      '2026-11-03',
      '2026-11-03T06:30:00Z',
      'do_not_drive',
    );
    // Before the range, but with a defect nobody has fixed.
    await check(
      'c0000000-0000-4000-8000-000000000003',
      COMPANY_A,
      VEHICLE_A,
      '2026-08-30',
      '2026-08-30T06:30:00Z',
      'advisory',
    );
    // Another company's, which must never appear.
    await check(
      'c0000000-0000-4000-8000-000000000004',
      COMPANY_B,
      VEHICLE_B,
      '2026-11-03',
      '2026-11-03T07:00:00Z',
      'clear',
    );

    const defect = (
      id: string,
      checkId: string,
      label: string,
      severity: string,
      status: string,
      createdAt: string,
      changedAt: string | null,
      changedBy: string | null,
    ) =>
      ownerPool.query(
        `insert into checks.defects (id, check_id, company_id, vehicle_id, vehicle_name, item_id, label, severity, detail,
                                     note, status, created_at, status_changed_at, status_changed_by)
         values ($1, $2, $3, $4, 'x', 'item', $5, $6, 'Not working', null, $7, $8, $9, $10)`,
        [
          id,
          checkId,
          COMPANY_A,
          VEHICLE_A,
          label,
          severity,
          status,
          createdAt,
          changedAt,
          changedBy,
        ],
      );
    await defect(
      'd0000000-0000-4000-8000-000000000001',
      'c0000000-0000-4000-8000-000000000002',
      'Brake light',
      'do_not_drive',
      'fixed',
      '2026-11-03T06:31:00Z',
      '2026-11-04T10:00:00Z',
      OFFICE,
    );
    await defect(
      'd0000000-0000-4000-8000-000000000002',
      'c0000000-0000-4000-8000-000000000003',
      'Wiper blade',
      'advisory',
      'open',
      '2026-08-30T06:31:00Z',
      null,
      null,
    );
    // Old and fixed: not in a November pack.
    await defect(
      'd0000000-0000-4000-8000-000000000003',
      'c0000000-0000-4000-8000-000000000003',
      'Mirror',
      'advisory',
      'fixed',
      '2026-08-30T06:32:00Z',
      '2026-08-31T09:00:00Z',
      OFFICE,
    );

    await ownerPool.query(
      `insert into maintenance.repairs (id, company_id, defect_id, vehicle_id, vehicle_name, title, severity, due_date,
                                        status, note, done_on, created_at, created_by, completed_at, completed_by)
       values ('e0000000-0000-4000-8000-000000000001', $1, 'd0000000-0000-4000-8000-000000000001', $2, 'x',
               'Replace brake light', 'do_not_drive', '2026-11-04', 'done', 'New bulb', '2026-11-04',
               '2026-11-03T08:00:00Z', $3, '2026-11-04T10:00:00Z', $3)`,
      [COMPANY_A, VEHICLE_A, OFFICE],
    );

    const itemType = (id: string, name: string) =>
      ownerPool.query(
        `insert into maintenance.item_types (id, company_id, name, interval_value, interval_unit, warn_days, applies_to,
                                             vehicle_ids, created_at, updated_at)
         values ($1, $2, $3, 12, 'months', 28, 'all', '[]', now(), now())`,
        [id, COMPANY_A, name],
      );
    await itemType('f0000000-0000-4000-8000-000000000001', 'MOT');
    await itemType('f0000000-0000-4000-8000-000000000002', 'Safety inspection');
    const schedule = (itemId: string, due: string, last: string | null) =>
      ownerPool.query(
        `insert into maintenance.schedules (vehicle_id, item_type_id, company_id, due_date, last_done, updated_at)
         values ($1, $2, $3, $4, $5, now())`,
        [VEHICLE_A, itemId, COMPANY_A, due, last],
      );
    await schedule('f0000000-0000-4000-8000-000000000001', '2026-10-01', '2025-10-01');
    await schedule('f0000000-0000-4000-8000-000000000002', '2027-01-10', '2026-11-01');
    await ownerPool.query(
      `insert into maintenance.history (id, vehicle_id, item_type_id, company_id, item_name, done_on, next_due, note,
                                        done_by, recorded_at)
       values ('a0000000-0000-4000-8000-000000000001', $1, 'f0000000-0000-4000-8000-000000000002', $2,
               'Safety inspection', '2026-11-01', '2027-01-10', 'Passed', $3, '2026-11-01T15:00:00Z')`,
      [VEHICLE_A, COMPANY_A, OFFICE],
    );

    // The brake light was seen by the office, then fixed. The wiper defect has no steps recorded.
    await ownerPool.query(
      `insert into checks.defect_events (id, defect_id, company_id, status, at, by) values
         ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', $1, 'acknowledged', '2026-11-03T09:00:00Z', $2),
         ('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', $1, 'fixed', '2026-11-04T10:00:00Z', $2)`,
      [COMPANY_A, OFFICE],
    );
    // The MOT date was first entered before the period (so it is not in it), then corrected inside it.
    await ownerPool.query(
      `insert into maintenance.date_changes
         (id, company_id, vehicle_id, item_type_id, item_name, from_due, to_due, changed_by, changed_at) values
         ('b1000000-0000-4000-8000-000000000001', $1, $2, 'f0000000-0000-4000-8000-000000000001', 'MOT', null, '2026-09-01', $3, '2026-08-01T09:00:00Z'),
         ('b1000000-0000-4000-8000-000000000002', $1, $2, 'f0000000-0000-4000-8000-000000000001', 'MOT', '2026-09-01', '2026-10-01', $3, '2026-10-05T09:00:00Z')`,
      [COMPANY_A, VEHICLE_A, OFFICE],
    );

    const audit = createAuditModule({
      db,
      clock: new FakeClock('2026-11-08T12:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      vehicles: {
        find: async (id) => {
          const { rows } = await sql<{
            id: string;
            company_id: string;
            name: string;
            registration: string | null;
          }>`
            select id, company_id, name, registration from fleet.vehicles where id = ${id}
          `.execute(db);
          const row = rows[0];
          return row === undefined
            ? null
            : {
                id: row.id,
                companyId: row.company_id,
                name: row.name,
                registration: row.registration ?? undefined,
              };
        },
      },
      people: {
        driverLabel: (id) => Promise.resolve(id === DRIVER ? 'Sam Driver' : null),
        // Its own scope, as the real one has: the real scopes refuse it if it is reached from inside another.
        staffNames: () =>
          scopes.run({ kind: 'platform' }, () =>
            Promise.resolve(new Map([[OFFICE, 'Pat Office']])),
          ),
        companyName: () => scopes.run({ kind: 'platform' }, () => Promise.resolve('Acme Haulage')),
      },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    audit.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const get = (vehicleId: string, who?: string, query = '?from=2026-10-01&to=2026-11-08') =>
    app.inject({
      method: 'GET',
      url: `/staff/audit/vehicles/${vehicleId}${query}`,
      ...(who === undefined ? {} : { headers: { 'x-test-staff-id': who } }),
    });

  it('needs a sign-in, and a company person who can read check results', async () => {
    expect((await get(VEHICLE_A)).statusCode).toBe(401);
    expect((await get(VEHICLE_A, A_MAINTENANCE_ONLY)).statusCode).toBe(403);
  });

  it('gives a company person their own vehicle’s pack, with the dates as the same day and the people named', async () => {
    const response = await get(VEHICLE_A, A_REPORTS);
    expect(response.statusCode).toBe(200);
    const pack = response.json<Pack>();
    expect(pack.vehicle).toEqual({
      id: VEHICLE_A,
      name: 'Scania R450',
      registration: 'NX21ABC',
      company: 'Acme Haulage',
    });
    expect(pack.range).toEqual({ from: '2026-10-01', to: '2026-11-08' });
    expect(pack.checks.map((c) => [c.day, c.who, c.result, c.defects])).toEqual([
      ['2026-11-02', 'Sam Driver', 'clear', 0],
      ['2026-11-03', 'Sam Driver', 'do_not_drive', 1],
    ]);
    expect(pack.defects.map((d) => [d.item, d.status])).toEqual([
      ['Wiper blade', 'open'],
      ['Brake light', 'fixed'],
    ]);
    expect(pack.defects.find((d) => d.item === 'Brake light')).toMatchObject({
      foundBy: 'Sam Driver',
      lastChangeBy: 'Pat Office',
      repair: {
        title: 'Replace brake light',
        status: 'done',
        doneOn: '2026-11-04',
        finishedBy: 'Pat Office',
      },
    });
    expect(pack.maintenance.items).toEqual([
      { name: 'MOT', dueDate: '2026-10-01', lastDone: '2025-10-01', state: 'overdue' },
      { name: 'Safety inspection', dueDate: '2027-01-10', lastDone: '2026-11-01', state: 'ok' },
    ]);
    expect(pack.maintenance.done).toEqual([
      expect.objectContaining({
        item: 'Safety inspection',
        doneOn: '2026-11-01',
        nextDue: '2027-01-10',
        by: 'Pat Office',
      }),
    ]);
    expect(pack.summary).toMatchObject({
      checks: 2,
      doNotDrive: 1,
      defectsFound: 1,
      defectsNotFixed: 1,
      maintenanceDone: 1,
      maintenanceOverdue: 1,
      dueDatesChanged: 1,
    });
  });

  it('shows every step of a defect, and the due dates that were corrected in the period', async () => {
    const pack = (await get(VEHICLE_A, A_REPORTS)).json<Pack>();
    expect(pack.defects.find((d) => d.item === 'Brake light')?.history).toEqual([
      { status: 'acknowledged', at: '2026-11-03T09:00:00.000Z', by: 'Pat Office' },
      { status: 'fixed', at: '2026-11-04T10:00:00.000Z', by: 'Pat Office' },
    ]);
    expect(pack.defects.find((d) => d.item === 'Wiper blade')?.history).toEqual([]);
    // Only the correction made inside the period: the first entry, in August, is outside it.
    expect(pack.maintenance.changes).toEqual([
      {
        item: 'MOT',
        from: '2026-09-01',
        to: '2026-10-01',
        at: '2026-10-05T09:00:00.000Z',
        by: 'Pat Office',
      },
    ]);
    expect(pack.timeline.filter((e) => e.kind === 'due_date_changed').map((e) => e.title)).toEqual([
      'MOT due date changed from 1 Sep 2026 to 1 Oct 2026',
    ]);
  });

  it('leaves out an old defect that is fixed, and keeps an old one that is not', async () => {
    const pack = (await get(VEHICLE_A, A_REPORTS)).json<Pack>();
    expect(pack.defects.map((d) => d.item)).not.toContain('Mirror');
    expect(pack.defects.map((d) => d.item)).toContain('Wiper blade');
  });

  it('sets everything in one timeline, oldest first', async () => {
    const { timeline } = (await get(VEHICLE_A, A_REPORTS)).json<Pack>();
    const times = timeline.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(timeline.map((e) => e.kind)).toEqual([
      'defect_found',
      'due_date_changed',
      'maintenance_done',
      'check',
      'check',
      'defect_found',
      'repair_booked',
      'defect_changed', // seen by the office, 3 November
      'defect_changed', // fixed, 4 November
      'repair_finished',
    ]);
  });

  it('does not show another company’s vehicle to a company person, the same answer as for one that is not there', async () => {
    const theirs = await get(VEHICLE_B, A_REPORTS);
    const missing = await get('99999999-9999-4999-8999-999999999999', A_REPORTS);
    expect(theirs.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(theirs.json()).toMatchObject({ tag: 'NotFound' });
    expect((await get(VEHICLE_A, B_REPORTS)).statusCode).toBe(404);
  });

  it('shows WagonWise staff any company’s vehicle, and only that vehicle’s records', async () => {
    const b = (await get(VEHICLE_B, ADMIN)).json<Pack>();
    expect(b.vehicle.name).toBe('Volvo FH');
    expect(b.checks).toHaveLength(1);
    expect(b.defects).toEqual([]);
    expect(b.maintenance.items).toEqual([]);
    const a = (await get(VEHICLE_A, ADMIN)).json<Pack>();
    expect(a.checks).toHaveLength(2);
  });

  it('refuses a malformed id and a bad range', async () => {
    expect((await get('not-an-id', ADMIN)).statusCode).toBe(400);
    expect((await get(VEHICLE_A, ADMIN, '?from=2026-11-08&to=2026-01-01')).statusCode).toBe(400);
    expect((await get(VEHICLE_A, ADMIN, '?from=yesterday')).statusCode).toBe(400);
  });

  it('defaults to the last twelve months', async () => {
    const pack = (await get(VEHICLE_A, ADMIN, '')).json<Pack>();
    expect(pack.range).toEqual({ from: '2025-11-09', to: '2026-11-08' });
    expect(pack.checks.length).toBeGreaterThan(0);
  });

  it('gives a defect handled before the history was kept one starting step, from its latest change (the migration’s own backfill)', async () => {
    // The statement is read out of the migration itself, so this cannot pass against a copy that has drifted from it.
    const migration = readFileSync(`${migrationsDir}/0085_audit_history.sql`, 'utf8');
    const backfill = /insert into checks\.defect_events[\s\S]*?status_changed_at is not null;/.exec(
      migration,
    )?.[0];
    expect(backfill).toBeDefined();
    const client = await ownerPool.connect();
    try {
      await client.query('begin');
      await client.query('delete from checks.defect_events');
      await client.query(backfill as string);
      const { rows } = await client.query<{ defect_id: string; status: string; by: string | null }>(
        'select defect_id, status, by from checks.defect_events order by defect_id',
      );
      // The brake light (fixed on 4 November) and the old mirror (fixed on 31 August) have a latest change. The wiper was never changed.
      expect(rows).toEqual([
        { defect_id: 'd0000000-0000-4000-8000-000000000001', status: 'fixed', by: OFFICE },
        { defect_id: 'd0000000-0000-4000-8000-000000000003', status: 'fixed', by: OFFICE },
      ]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
