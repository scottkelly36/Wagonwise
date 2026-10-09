import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHoursModule, type HoursModule, type StaffCaller } from '../modules/hours/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { makeId } from '../shared/brand.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const SAM = 'd0000000-0000-4000-8000-000000000001';
const KIM = 'd0000000-0000-4000-8000-000000000002';
const MANAGER = '50000000-0000-4000-8000-000000000001';
const DISPATCHER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const staff: Record<string, StaffCaller> = {
  [MANAGER]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_fleet'] },
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_fleet'] },
};
const identifiers: Record<string, string> = { [SAM]: 'sam@example.com', [KIM]: 'kim@example.com' };

/**
 * Sharing a driver's hours status, on real Postgres with Row-Level Security: nothing is stored or shown unless the firm and the
 * driver have both switched it on, the driver reads the firm's switch only for companies they belong to, withdrawing and
 * switching off remove the status, and another company sees none of it.
 */
describe('driver hours sharing end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let hours: HoursModule;
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const onJob = new Map<string, string>(); // driver -> company

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    // Sam drives for ACME. Kim drives for BETA, and is on a job there.
    await ownerPool.query(`
      insert into fleet.driver_links (id, company_id, driver_id, status, created_at, decided_at)
        values ('f1000000-0000-4000-8000-000000000001', '${ACME}', '${SAM}', 'active', now(), now()),
               ('f1000000-0000-4000-8000-000000000002', '${BETA}', '${KIM}', 'active', now(), now());
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
    hours = createHoursModule({
      db,
      clock,
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      driverIdentities: { getIdentifier: (id) => Promise.resolve(identifiers[id] ?? null) },
      driverCompanies: {
        activeCompanies: (driverId) =>
          Promise.resolve(
            driverId === SAM
              ? [{ id: makeId<'CompanyId'>(ACME), name: 'Acme Haulage' }]
              : [{ id: makeId<'CompanyId'>(BETA), name: 'Beta Haulage' }],
          ),
      },
      activeJobs: {
        companyOfActiveJob: (driverId) => {
          const c = onJob.get(driverId);
          return Promise.resolve(c === undefined ? null : makeId<'CompanyId'>(c));
        },
        driversOnJobs: (companyId) =>
          Promise.resolve(
            [...onJob].filter(([, c]) => c === companyId).map(([d]) => makeId<'DriverId'>(d)),
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
    hours.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const asDriver = (id: string) => ({ headers: { 'x-test-driver-id': id } });
  const live = { state: 'driving', drivingLeftMin: 80, next: 'break' };
  const rows = async (table: 'status' | 'sharing') =>
    (await ownerPool.query(`select count(*)::int as n from hours.${table}`)).rows[0] as {
      n: number;
    };
  const statuses = (who: string, company = ACME) =>
    app.inject({ method: 'GET', url: `/staff/hours/companies/${company}/status`, ...as(who) });
  const share = (driver: string, company: string, sharing: boolean) =>
    app.inject({
      method: 'PUT',
      url: `/hours/sharing/${company}`,
      payload: { sharing, wordingVersion: 1 },
      ...asDriver(driver),
    });
  const report = (driver: string, body: object = live) =>
    app.inject({ method: 'PUT', url: '/hours/status', payload: body, ...asDriver(driver) });

  it('starts off: the firm has it off, so the driver is offered nothing and cannot agree', async () => {
    const mine = await app.inject({ method: 'GET', url: '/hours/sharing', ...asDriver(SAM) });
    expect(mine.json()).toEqual({
      companies: [
        { companyId: ACME, companyName: 'Acme Haulage', firmEnabled: false, sharing: false },
      ],
    });
    const refused = await share(SAM, ACME, true);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ tag: 'FirmNotEnabled' });
    onJob.set(SAM, ACME);
    expect((await report(SAM)).statusCode).toBe(409);
    expect(await rows('sharing')).toEqual({ n: 0 });
    expect(await rows('status')).toEqual({ n: 0 });
  });

  it('only a manager (or WagonWise) switches it on for the firm', async () => {
    const put = (who: string, company = ACME) =>
      app.inject({
        method: 'PUT',
        url: `/staff/hours/companies/${company}/settings`,
        payload: { enabled: true },
        ...as(who),
      });
    expect((await put(DISPATCHER)).statusCode).toBe(403);
    expect((await put(RIVAL)).statusCode).toBe(403);
    expect((await put(MANAGER)).statusCode).toBe(200);
    const read = await app.inject({
      method: 'GET',
      url: `/staff/hours/companies/${ACME}/settings`,
      ...as(DISPATCHER),
    });
    expect(read.json()).toEqual({ enabled: true });
  });

  it('shows the driver the firm’s switch only for their own company, and lets them agree', async () => {
    const mine = await app.inject({ method: 'GET', url: '/hours/sharing', ...asDriver(SAM) });
    expect(mine.json<{ companies: { firmEnabled: boolean }[] }>().companies[0]?.firmEnabled).toBe(
      true,
    );
    // Kim drives for BETA, which has not switched it on: ACME's switch is invisible to them.
    const kims = await app.inject({ method: 'GET', url: '/hours/sharing', ...asDriver(KIM) });
    expect(kims.json<{ companies: { firmEnabled: boolean }[] }>().companies[0]?.firmEnabled).toBe(
      false,
    );
    expect((await share(SAM, ACME, true)).statusCode).toBe(200);
    expect(await rows('sharing')).toEqual({ n: 1 });
    expect((await share(SAM, BETA, true)).statusCode).toBe(404);
  });

  it('stores only the latest status, and shows it to the company’s staff alone', async () => {
    expect((await report(SAM)).statusCode).toBe(204);
    clock.set('2026-10-09T09:20:00.000Z');
    expect(
      (await report(SAM, { state: 'on_break', drivingLeftMin: 270, next: 'break' })).statusCode,
    ).toBe(204);
    expect(await rows('status')).toEqual({ n: 1 });
    const shown = (await statuses(DISPATCHER)).json<{ statuses: Record<string, unknown>[] }>();
    expect(shown.statuses).toEqual([
      {
        driverId: SAM,
        state: 'on_break',
        drivingLeftMin: 270,
        next: 'break',
        updatedAt: '2026-10-09T09:20:00.000Z',
      },
    ]);
    expect((await statuses(RIVAL, ACME)).statusCode).toBe(403);
    expect((await statuses(RIVAL, BETA)).json()).toEqual({ statuses: [] });
  });

  it('refuses a driver who has not chosen, and a status for a job at another company', async () => {
    onJob.set(KIM, BETA);
    expect((await report(KIM)).statusCode).toBe(409);
    expect(await rows('status')).toEqual({ n: 1 });
  });

  it('stops showing a driver whose job has ended, and drops statuses after 12 hours', async () => {
    onJob.delete(SAM);
    expect((await statuses(MANAGER)).json()).toEqual({ statuses: [] });
    onJob.set(SAM, ACME);
    expect((await statuses(MANAGER)).json<{ statuses: unknown[] }>().statuses).toHaveLength(1);
    clock.set('2026-10-09T21:30:00.000Z');
    expect((await statuses(MANAGER)).json()).toEqual({ statuses: [] });
    expect(await hours.pruneStaleStatuses()).toBe(1);
    expect(await rows('status')).toEqual({ n: 0 });
  });

  it('removes the status at once when the driver stops sharing, finishes, or the firm switches it off', async () => {
    clock.set('2026-10-09T10:00:00.000Z');
    await report(SAM);
    expect(await rows('status')).toEqual({ n: 1 });
    expect((await share(SAM, ACME, false)).statusCode).toBe(200);
    expect(await rows('status')).toEqual({ n: 0 });
    expect(await rows('sharing')).toEqual({ n: 0 });
    expect((await report(SAM)).statusCode).toBe(409);

    await share(SAM, ACME, true);
    await report(SAM);
    const finished = await app.inject({ method: 'DELETE', url: '/hours/status', ...asDriver(SAM) });
    expect(finished.statusCode).toBe(204);
    expect(await rows('status')).toEqual({ n: 0 });

    await report(SAM);
    await app.inject({
      method: 'PUT',
      url: `/staff/hours/companies/${ACME}/settings`,
      payload: { enabled: false },
      ...as(MANAGER),
    });
    expect(await rows('status')).toEqual({ n: 0 });
    expect((await statuses(MANAGER)).json()).toEqual({ statuses: [] });
    expect((await report(SAM)).statusCode).toBe(409);
  });

  it('deletes everything held about a driver whose account is deleted', async () => {
    await app.inject({
      method: 'PUT',
      url: `/staff/hours/companies/${ACME}/settings`,
      payload: { enabled: true },
      ...as(MANAGER),
    });
    await report(SAM);
    expect(await rows('sharing')).toEqual({ n: 1 });
    await hours.eraseDriverData(SAM);
    expect(await rows('sharing')).toEqual({ n: 0 });
    expect(await rows('status')).toEqual({ n: 0 });
  });
});
