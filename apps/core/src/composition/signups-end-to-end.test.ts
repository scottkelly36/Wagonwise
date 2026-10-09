import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSignupsModule, type StaffCaller } from '../modules/signups/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '50000000-0000-4000-8000-000000000001';
const FLEET = '50000000-0000-4000-8000-000000000002';
const staff: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [FLEET]: {
    kind: 'fleet',
    companyId: '11111111-1111-4111-8111-111111111111',
    privileges: ['manage_billing'],
  },
};

/**
 * The landing page's sign-up on real Postgres with Row-Level Security: anyone can register through the public route, nobody
 * but WagonWise staff can read the list (the table refuses the app role everywhere else), an address already held changes
 * nothing, and a trap field stores nothing.
 */
describe('signups end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let scopes: PostgresDataScopes;
  let db: Kysely<Record<string, unknown>>;

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
    scopes = new PostgresDataScopes(appPool);
    db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });
    const signups = createSignupsModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-09T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    signups.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const rows = async () =>
    (
      await ownerPool.query<{ email: string; consented_at: Date }>(
        `select email, consented_at from signups.testers order by email`,
      )
    ).rows;
  const post = (payload: object, url = '/signups') => app.inject({ method: 'POST', url, payload });

  it('registers someone with no sign-in, storing the address tidied and when they agreed', async () => {
    const response = await post({
      email: ' Sam@Example.com ',
      name: 'Sam',
      role: 'driver',
      consent: true,
    });
    expect(response.statusCode).toBe(204);
    expect(await rows()).toEqual([
      { email: 'sam@example.com', consented_at: new Date('2026-10-09T09:00:00.000Z') },
    ]);
  });

  it('answers the same for an address already held, and stores no second row', async () => {
    const again = await post({ email: 'SAM@example.com', role: 'company', consent: true });
    expect(again.statusCode).toBe(204);
    expect(await rows()).toHaveLength(1);
  });

  it('refuses no agreement, a bad address, and a malformed request, and stores nothing for the trap field', async () => {
    expect(
      (await post({ email: 'kim@example.com', role: 'driver', consent: false })).statusCode,
    ).toBe(400);
    expect((await post({ email: 'nope', role: 'driver', consent: true })).statusCode).toBe(400);
    expect((await post({ nonsense: true })).statusCode).toBe(400);
    const trapped = await post({
      email: 'bot@example.com',
      role: 'driver',
      consent: true,
      website: 'http://spam.example',
    });
    expect(trapped.statusCode).toBe(204);
    expect((await rows()).map((r) => r.email)).toEqual(['sam@example.com']);
  });

  it('shows the list to WagonWise staff only', async () => {
    await post({
      email: 'kim@example.com',
      name: 'Kim',
      role: 'company',
      company: 'Acme',
      fleetSize: '6-15',
      consent: true,
    });
    const list = await app.inject({ method: 'GET', url: '/staff/signups', ...as(ADMIN) });
    expect(list.statusCode).toBe(200);
    const body = list.json<{
      total: number;
      testers: { email: string; company?: string; fleetSize?: string }[];
    }>();
    expect(body.total).toBe(2);
    expect(body.testers.find((t) => t.email === 'kim@example.com')).toMatchObject({
      company: 'Acme',
      fleetSize: '6-15',
    });
    expect(
      (await app.inject({ method: 'GET', url: '/staff/signups', ...as(FLEET) })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/staff/signups' })).statusCode).toBe(401);
  });

  it('keeps the table closed to everything but the platform scope', async () => {
    const asCompany = await scopes.run(
      { kind: 'company', companyId: '11111111-1111-4111-8111-111111111111' },
      async () =>
        (await sql<{ n: number }>`select count(*)::int as n from signups.testers`.execute(db))
          .rows[0],
    );
    expect(asCompany?.n).toBe(0);
  });

  it('removes one person from the list, or lets them remove themselves', async () => {
    const id =
      (
        await ownerPool.query<{ id: string }>(
          `select id from signups.testers where email = 'kim@example.com'`,
        )
      ).rows[0]?.id ?? '';
    expect(
      (await app.inject({ method: 'DELETE', url: `/staff/signups/${id}`, ...as(FLEET) }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'DELETE', url: `/staff/signups/${id}`, ...as(ADMIN) }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `/staff/signups/${id}`, ...as(ADMIN) }))
        .statusCode,
    ).toBe(404);
    expect((await post({ email: ' SAM@example.com ' }, '/signups/remove')).statusCode).toBe(204);
    expect((await post({ email: 'nobody@example.com' }, '/signups/remove')).statusCode).toBe(204);
    expect(await rows()).toEqual([]);
  });
});
