import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UsageReportDto } from '@wagonwise/contracts/usage';
import { createUsageModule, type StaffCaller } from '../modules/usage/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '60000000-0000-4000-8000-000000000001';
const FLEET = '60000000-0000-4000-8000-000000000002';
const ACME = '61000000-0000-4000-8000-000000000001';
const IDLE = '61000000-0000-4000-8000-000000000002';
const staff: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [FLEET]: { kind: 'fleet', companyId: ACME, privileges: ['view_reports'] },
};

const id = (n: number) => `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-10-09T12:00:00.000Z';
const hoursAgo = (h: number) => new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString();

/**
 * The admin's usage page on real Postgres with Row-Level Security: a small, known world (three drivers with different
 * last-seen times, two firms, one idle) gives exact counts, and a company cannot read the report.
 */
describe('usage end to end (real RLS, real scopes)', () => {
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

    const q = (text: string, values: unknown[] = []) => ownerPool.query(text, values);
    await q(
      `insert into companies.companies (id, name, created_at) values ($1,'Acme Haulage',$3),($2,'Idle Ltd',$3)`,
      [ACME, IDLE, hoursAgo(900)],
    );
    // Three drivers: seen 2 hours ago, 3 days ago, and never.
    for (const n of [1, 2, 3]) {
      // Driver 1 joined today; drivers 2 and 3 joined yesterday (UK days).
      await q(`insert into identity.drivers (id, identifier, created_at) values ($1, $2, $3)`, [
        id(n),
        `+4477000000${n}`,
        hoursAgo(n === 1 ? 5 : 30),
      ]);
    }
    const session = (n: number, driver: number, last: string) =>
      q(
        `insert into identity.sessions (id, driver_id, refresh_token_hash, issued_at, last_used_at, refresh_expires_at)
         values ($1,$2,$3,$4,$4,$5)`,
        [id(n), id(driver), `h${n}`, last, hoursAgo(-1000)],
      );
    await session(10, 1, hoursAgo(2));
    await session(11, 2, hoursAgo(72));
    await q(`insert into identity.devices (id, driver_id, push_token) values ($1,$2,'t1')`, [
      id(20),
      id(1),
    ]);
    for (const n of [1, 2]) {
      await q(
        `insert into fleet.driver_links (id, company_id, driver_id, status, created_at) values ($1,$2,$3,'active',$4)`,
        [id(30 + n), ACME, id(n), hoursAgo(500)],
      );
    }
    await q(
      `insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
       values ($1,$2,'Truck',4,2.5,12,18)`,
      [id(40), ACME],
    );
    // One staff member of Acme, signed in 5 hours ago.
    await q(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, created_at, password_hash, second_factor_method)
       values ($1,'fleet',$2,'boss@acme.test','Boss',$3,'x','email')`,
      [id(50), ACME, hoursAgo(800)],
    );
    await q(
      `insert into companies.staff_sessions (id, staff_id, refresh_token_hash, issued_at, last_used_at, refresh_expires_at)
       values ($1,$2,'sh1',$3,$3,$4)`,
      [id(51), id(50), hoursAgo(5), hoursAgo(-1000)],
    );
    // A job made this month and delivered today; a trip running; one check today.
    await q(
      `insert into jobs.jobs (id, company_id, reference, status, created_at, timeline)
       values ($1,$2,'J1','delivered',$3,$4::jsonb)`,
      [id(60), ACME, hoursAgo(30), JSON.stringify([{ status: 'delivered', at: hoursAgo(1) }])],
    );
    await q(
      `insert into routing.active_trips (id, route_plan_id, driver_id, started_at) values ($1,$2,$3,$4)`,
      [id(70), id(71), id(1), hoursAgo(1)],
    );
    // How far drivers got: driver 1 chose a vehicle, planned a route and drove on two different days (an earlier trip ended);
    // driver 2 chose a vehicle and drove once; driver 3 only has an account.
    for (const n of [1, 2]) {
      await q(
        `insert into routing.vehicle_profiles (id, driver_id, name, height_m, width_m, length_m, gross_weight_t)
         values ($1,$2,'Artic',4,2.5,16,44)`,
        [id(90 + n), id(n)],
      );
    }
    await q(
      `insert into routing.route_plans (id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
         geometry, distance_km, duration_min, created_at)
       values ($1,$2,$3,54.97,-2.1,55.0,-1.9,'x',10,20,$4)`,
      [id(71), id(1), id(91), hoursAgo(1)],
    );
    await q(
      `insert into routing.active_trips (id, route_plan_id, driver_id, started_at, ended_at) values
         ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10)`,
      [
        id(72),
        id(73),
        id(1),
        hoursAgo(30),
        hoursAgo(29),
        id(74),
        id(75),
        id(2),
        hoursAgo(50),
        hoursAgo(49),
      ],
    );
    await q(
      `insert into checks.checks (id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name,
         driver_id, check_day, items, answers, result, submitted_at)
       values ($1,$2,$3,1,'Daily',$4,'Truck',$5,'2026-10-09','[]','{}','clear',$6)`,
      [id(80), ACME, id(81), id(40), id(1), hoursAgo(3)],
    );

    const usage = createUsageModule({
      db,
      clock: new FakeClock(NOW),
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(staff[staffId] ?? null) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const staffId = request.headers['x-test-staff-id'];
      if (typeof staffId === 'string') request.staffId = staffId;
      done();
    });
    usage.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const report = async () => (await get(ADMIN)).json<UsageReportDto>();

  const get = (who?: string) =>
    app.inject({
      method: 'GET',
      url: '/staff/usage',
      ...(who === undefined ? {} : { headers: { 'x-test-staff-id': who } }),
    });

  it('counts drivers by when they were last seen, and those who never signed in', async () => {
    const response = await get(ADMIN);
    expect(response.statusCode).toBe(200);
    const body = response.json<UsageReportDto>();
    expect(body.drivers).toEqual({
      total: 3,
      neverSignedIn: 1,
      active24h: 1,
      active7d: 2,
      active30d: 2,
    });
    expect(body.staff).toEqual({
      total: 1,
      neverSignedIn: 0,
      active24h: 1,
      active7d: 1,
      active30d: 1,
    });
    expect(body.devices).toEqual({ total: 1 });
    expect(body.tripsRunningNow).toBe(1);
    expect(body.testers).toEqual({ total: 0 });
  });

  it('counts how far drivers got, as different drivers, with those who came back', async () => {
    const body = await report();
    expect(body.funnel).toEqual({
      accounts: 3,
      signedIn: 2,
      hasVehicle: 2,
      plannedRoute: 1,
      startedTrip: 2,
      startedTripOnTwoDays: 1,
    });
  });

  it('counts how far each day of new drivers has got, a day at a time', async () => {
    const body = await report();
    expect(body.newDriversByDay).toHaveLength(14);
    expect(body.newDriversByDay.at(-1)).toEqual({
      day: '2026-10-09',
      joined: 1,
      hasVehicle: 1,
      plannedRoute: 1,
      startedTrip: 1,
    });
    expect(body.newDriversByDay.at(-2)).toEqual({
      day: '2026-10-08',
      joined: 2,
      hasVehicle: 1,
      plannedRoute: 0,
      startedTrip: 1,
    });
    // Days nobody joined are there, with zeros.
    expect(body.newDriversByDay.at(-3)).toEqual({
      day: '2026-10-07',
      joined: 0,
      hasVehicle: 0,
      plannedRoute: 0,
      startedTrip: 0,
    });
    expect(body.newDriversByDay.reduce((sum, d) => sum + d.joined, 0)).toBe(body.drivers.total);
  });

  it('shows each firm with its drivers, vehicles, staff, jobs and when it was last used', async () => {
    const body = await report();
    expect(body.firms).toEqual({ total: 2, activeThisWeek: 1 });
    expect(body.firmList).toEqual([
      {
        id: ACME,
        name: 'Acme Haulage',
        drivers: 2,
        vehicles: 1,
        staff: 1,
        jobsThisMonth: 1,
        lastActiveAt: hoursAgo(2),
      },
      {
        id: IDLE,
        name: 'Idle Ltd',
        drivers: 0,
        vehicles: 0,
        staff: 0,
        jobsThisMonth: 0,
        lastActiveAt: null,
      },
    ]);
  });

  it('fills every day and week, with the latest holding what happened today', async () => {
    const body = await report();
    expect(body.tripsPerDay).toHaveLength(14);
    expect(body.tripsPerDay.at(-1)).toEqual({ day: '2026-10-09', count: 1 });
    for (const series of [body.jobsCreatedPerWeek, body.jobsDeliveredPerWeek, body.checksPerWeek]) {
      expect(series).toHaveLength(8);
      expect(series.at(-1)).toMatchObject({ weekStart: '2026-10-05' });
    }
    expect(body.jobsCreatedPerWeek.at(-1)?.count).toBe(1);
    expect(body.jobsDeliveredPerWeek.at(-1)?.count).toBe(1);
    expect(body.checksPerWeek.at(-1)?.count).toBe(1);
  });

  it('is for WagonWise staff only', async () => {
    expect((await get(FLEET)).statusCode).toBe(403);
    expect((await get()).statusCode).toBe(401);
  });
});
