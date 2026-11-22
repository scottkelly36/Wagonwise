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
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
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
  let usage: ReturnType<typeof createUsageModule>;
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
    // A fourth driver who joined yesterday, used the app 3 hours ago and then deleted the account. Deleting keeps the row
    // (anonymised, deleted_at set), so every count below must leave it out and only deletedDrivers counts it.
    await q(
      `insert into identity.drivers (id, identifier, created_at, deleted_at) values ($1, $2, $3, $4)`,
      [id(4), 'deleted-account-4', hoursAgo(30), hoursAgo(1)],
    );
    await session(12, 4, hoursAgo(3));
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
    // The weeks drivers started trips in: drivers 1 and 2 drove in the week they joined (Monday 5 October).
    await q(
      `insert into routing.driver_trip_weeks (driver_id, week) values ($1, '2026-10-05'), ($2, '2026-10-05')`,
      [id(1), id(2)],
    );
    await q(
      `insert into checks.checks (id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name,
         driver_id, check_day, items, answers, result, submitted_at)
       values ($1,$2,$3,1,'Daily',$4,'Truck',$5,'2026-10-09','[]','{}','clear',$6)`,
      [id(80), ACME, id(81), id(40), id(1), hoursAgo(3)],
    );

    usage = createUsageModule({
      db,
      clock: new FakeClock(NOW),
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      callers: { getCaller: (staffId) => Promise.resolve(staff[staffId] ?? null) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const staffId = request.headers['x-test-staff-id'];
      if (typeof staffId === 'string') request.staffId = staffId;
      const driverId = request.headers['x-test-driver-id'];
      if (typeof driverId === 'string') request.driverId = driverId;
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
    // The deleted fourth driver is in none of those figures: only this count has it.
    expect(body.deletedDrivers).toBe(1);
    expect(body.funnel.accounts).toBe(3);
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
    // The first request in this file pays for a cold server and database, and under the whole suite running at once it has taken
    // just over the default 5 seconds (2026-11-16, 5016 ms on a push). The later tests reuse the warm connections.
  }, 30_000);

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

  it('counts, for each week of new drivers, how many started a trip in that week and each one since', async () => {
    const body = await report();
    const weeks = body.retentionByWeek ?? [];
    expect(weeks.map((w) => w.weekStart)).toEqual([
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
    // All three joined this week; two have started a trip in it.
    expect(weeks.at(-1)).toEqual({ weekStart: '2026-10-05', joined: 3, startedTripInWeek: [2] });
    // A week nobody joined has a zero for each week from then to now: eight for the oldest.
    expect(weeks[0]).toEqual({
      weekStart: '2026-08-17',
      joined: 0,
      startedTripInWeek: [0, 0, 0, 0, 0, 0, 0, 0],
    });
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

  describe('flow events (anonymous, as the restricted app role)', () => {
    const SESSION = '63000000-0000-4000-8000-000000000001';
    const post = (body: unknown, driver: string | null = id(1)) =>
      app.inject({
        method: 'POST',
        url: '/usage/flow-events',
        payload: body as Record<string, unknown>,
        ...(driver === null ? {} : { headers: { 'x-test-driver-id': driver } }),
      });
    const batch = (events: unknown[]) => ({
      sessionId: SESSION,
      appVersion: '1.2.1',
      platform: 'android',
      events,
    });

    it('stores a batch with no driver id, and leaves out one whose time is not believable', async () => {
      const response = await post(
        batch([
          { event: 'load_chosen', choice: 'hill_sensitive', at: hoursAgo(1) },
          { event: 'route_shown', at: hoursAgo(2) },
          { event: 'route_shown', at: hoursAgo(30) },
        ]),
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ recorded: 2 });

      const { rows } = await ownerPool.query<Record<string, unknown>>(
        `select * from usage.flow_events where session_id = $1 order by at`,
        [SESSION],
      );
      expect(rows.map((r) => [r.event, r.choice])).toEqual([
        ['route_shown', null],
        ['load_chosen', 'hill_sensitive'],
      ]);
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
        [
          'app_version',
          'at',
          'choice',
          'event',
          'id',
          'platform',
          'session_id',
          'update_date',
        ].sort(),
      );
    });

    it('deletes events over 90 days old, as the restricted app role', async () => {
      await ownerPool.query(
        `insert into usage.flow_events (id, session_id, event, app_version, platform, at)
         values ($1, $3, 'route_shown', '1.2.1', 'ios', $4), ($2, $3, 'route_shown', '1.2.1', 'ios', $5)`,
        [
          id(90),
          id(91),
          '63000000-0000-4000-8000-000000000002',
          hoursAgo(91 * 24),
          hoursAgo(89 * 24),
        ],
      );
      expect(await usage.pruneFlowEvents()).toBe(1);
      const { rows } = await ownerPool.query<{ id: string }>(
        `select id from usage.flow_events where session_id = '63000000-0000-4000-8000-000000000002'`,
      );
      expect(rows.map((r) => r.id)).toEqual([id(91)]);
    });

    it('keeps the day of the over-the-air update the phone runs, and refuses one that is not a date', async () => {
      const session = '63000000-0000-4000-8000-000000000003';
      const ok = await post({
        ...batch([{ event: 'plan_opened', choice: 'where_to', at: hoursAgo(1) }]),
        sessionId: session,
        updateDate: '2026-11-18',
      });
      expect(ok.statusCode).toBe(200);
      const { rows } = await ownerPool.query<{ day: string }>(
        `select to_char(update_date, 'YYYY-MM-DD') as day from usage.flow_events where session_id = $1`,
        [session],
      );
      expect(rows).toEqual([{ day: '2026-11-18' }]);
      expect(
        (
          await post({
            ...batch([{ event: 'route_shown', at: hoursAgo(1) }]),
            updateDate: 'yesterday',
          })
        ).statusCode,
      ).toBe(400);
    });

    it('refuses a choice that is not on the list, and anyone not signed in', async () => {
      expect(
        (await post(batch([{ event: 'destination_chosen', choice: 'NE46 3DT', at: hoursAgo(1) }])))
          .statusCode,
      ).toBe(400);
      expect(
        (await post(batch([{ event: 'route_shown', at: hoursAgo(1) }]), null)).statusCode,
      ).toBe(401);
    });

    it('reports the last 7 days of flows by sitting, with medians, choices and versions', async () => {
      await ownerPool.query(`delete from usage.flow_events`);
      const A = '64000000-0000-4000-8000-00000000000a';
      const B = '64000000-0000-4000-8000-00000000000b';
      const C = '64000000-0000-4000-8000-00000000000c';
      const minutesAgo = (m: number) => hoursAgo(m / 60);
      // [session, event, choice, version, minutes ago]
      const rows: [string, string, string | null, string, number][] = [
        [A, 'walkthrough_step', '1', '1.2.1', 60],
        [A, 'walkthrough_step', '5', '1.2.1', 59],
        [A, 'plan_opened', 'where_to', '1.2.1', 50],
        [A, 'load_chosen', 'normal', '1.2.1', 49],
        [A, 'destination_chosen', 'search', '1.2.1', 48], // 120 s after opening
        [A, 'route_shown', null, '1.2.1', 47],
        [A, 'trip_started', 'personal', '1.2.1', 46], // 60 s after the route
        [B, 'walkthrough_skipped', null, '1.2.0', 40],
        [B, 'plan_opened', 'where_to', '1.2.0', 30],
        [B, 'destination_chosen', 'what3words', '1.2.0', 26], // 240 s
        [C, 'reminder_opened', null, '1.10.0', 10],
        [C, 'plan_opened', 'replan', '1.10.0', 9],
        // Older than the week: not counted.
        [C, 'trip_started', 'job', '1.10.0', 8 * 24 * 60],
      ];
      await Promise.all(
        rows.map(([session, event, choice, version, ago], i) =>
          ownerPool.query(
            `insert into usage.flow_events (id, session_id, event, choice, app_version, platform, update_date, at)
             values ($1, $2, $3, $4, $5, 'android', $6, $7)`,
            [
              id(200 + i),
              session,
              event,
              choice,
              version,
              session === A ? '2026-11-18' : null,
              minutesAgo(ago),
            ],
          ),
        ),
      );

      const flows = (await report()).flows;
      expect(flows).toBeDefined();
      expect(flows?.windowDays).toBe(7);
      expect(flows?.sessions).toBe(3);
      expect(flows?.events).toBe(12);
      expect(flows?.steps).toEqual([
        { event: 'plan_opened', sessions: 3 },
        { event: 'destination_chosen', sessions: 2 },
        { event: 'route_options_shown', sessions: 0 },
        { event: 'route_option_picked', sessions: 0 },
        { event: 'route_shown', sessions: 1 },
        { event: 'trip_started', sessions: 1 },
      ]);
      // Newest version first, compared as numbers (1.10.0 is after 1.2.1).
      expect(flows?.byVersion).toEqual([
        { appVersion: '1.10.0', updateDate: null, sessions: 1, planOpened: 1, tripStarted: 0 },
        {
          appVersion: '1.2.1',
          updateDate: '2026-11-18',
          sessions: 1,
          planOpened: 1,
          tripStarted: 1,
        },
        { appVersion: '1.2.0', updateDate: null, sessions: 1, planOpened: 1, tripStarted: 0 },
      ]);
      expect(flows?.medianSeconds).toEqual({ planToPress: 180, routeToStart: 60 });
      expect(flows?.choices).toEqual([
        { event: 'destination_chosen', choice: 'search', count: 1 },
        { event: 'destination_chosen', choice: 'what3words', count: 1 },
        { event: 'load_chosen', choice: 'normal', count: 1 },
        { event: 'trip_started', choice: 'personal', count: 1 },
      ]);
      expect(flows?.walkthrough).toEqual({ started: 1, finished: 1, skipped: 1 });
      expect(flows?.remindersOpened).toBe(1);
      expect(flows?.referralOpened).toBe(0);
    });
  });

  describe('website visits (no account, nothing that identifies the visitor)', () => {
    const visit = (payload: object) => app.inject({ method: 'POST', url: '/site/visits', payload });

    it('records views and video plays, reports them by page, source and campaign, and refuses anything off the lists', async () => {
      await ownerPool.query(`delete from usage.site_visits`);
      for (const p of [
        { kind: 'view', page: '/for-hauliers/', source: 'Facebook', campaign: 'referral-nov' },
        { kind: 'view', page: '/for-hauliers/', source: 'facebook' },
        { kind: 'view', page: '/' },
        { kind: 'video_play', page: '/for-hauliers/' },
      ]) {
        expect((await visit(p)).statusCode).toBe(204);
      }
      expect((await visit({ kind: 'view', page: '/admin/' })).statusCode).toBe(400);
      expect(
        (await visit({ kind: 'view', page: '/', source: 'someone@example.com' })).statusCode,
      ).toBe(400);

      const { rows } = await ownerPool.query<Record<string, unknown>>(
        `select * from usage.site_visits limit 1`,
      );
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
        'at',
        'campaign',
        'id',
        'kind',
        'page',
        'source',
      ]);

      const site = (await report()).site;
      expect(site).toEqual({
        windowDays: 7,
        views: [
          { page: '/for-hauliers/', views: 2 },
          { page: '/', views: 1 },
        ],
        videoPlays: 1,
        sources: [
          { source: 'facebook', views: 2 },
          { source: 'direct', views: 1 },
        ],
        campaigns: [{ campaign: 'referral-nov', views: 1 }],
      });
    });

    it('deletes visits over 90 days old with the flow events', async () => {
      await ownerPool.query(
        `insert into usage.site_visits (id, kind, page, at) values ($1, 'view', '/', $2)`,
        [id(95), hoursAgo(91 * 24)],
      );
      expect(await usage.pruneFlowEvents()).toBeGreaterThanOrEqual(1);
      const { rows } = await ownerPool.query(`select id from usage.site_visits where id = $1`, [
        id(95),
      ]);
      expect(rows).toEqual([]);
    });
  });
});
