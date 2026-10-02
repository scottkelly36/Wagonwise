import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFleetModule } from '../modules/fleet/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const PAT = 'a0000000-0000-4000-8000-000000000001';
const SAM = 'b0000000-0000-4000-8000-000000000002';
const IDENTITIES: Record<string, string> = { [PAT]: 'pat@example.com', [SAM]: 'sam@example.com' };
const INVITE = 'c0000000-0000-4000-8000-000000000003';

/**
 * P2-M2.5's proof that a driver joins a company the way production runs it: through the real
 * `fleet` module, as `wagonwise_app`, in the driver's own scope with Row-Level Security on. It
 * exercises the migration's driver policy and `fleet.company_for_code()` through the real
 * repositories, which fakes can't.
 */
describe('driver links end to end (real RLS, driver scope)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    await ownerPool.query(`
      insert into fleet.company_codes (company_id, code, created_at)
        values ('${ACME}', 'ABCD2345', now());
      insert into fleet.driver_links (id, company_id, invited_identifier, status, created_at)
        values ('${INVITE}', '${ACME}', 'sam@example.com', 'invited', now());
    `);

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });

    const fleet = createFleetModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-02T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: () => Promise.resolve(null) },
      driverIdentities: { getIdentifier: (id) => Promise.resolve(IDENTITIES[id] ?? null) },
      companyNames: { namesFor: () => Promise.resolve(new Map([[ACME, 'Acme Haulage']])) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const driver = request.headers['x-test-driver-id'];
      if (typeof driver === 'string') request.driverId = driver;
      done();
    });
    fleet.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (driver: string) => ({ headers: { 'x-test-driver-id': driver } });
  const myLinks = async (driver: string) =>
    (await app.inject({ method: 'GET', url: '/fleet/links', ...as(driver) })).json<{
      links: { id: string; status: string; companyName?: string }[];
    }>().links;

  it('lets a driver ask with the code, and only that driver sees the request', async () => {
    const joined = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'abcd-2345' },
      ...as(PAT),
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toMatchObject({ status: 'requested', companyName: 'Acme Haulage' });

    expect((await myLinks(PAT)).map((l) => l.status)).toEqual(['requested']);
    expect(await myLinks(SAM)).toHaveLength(1); // only the invitation made for them

    const again = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'ABCD2345' },
      ...as(PAT),
    });
    expect(again.statusCode).toBe(409);
    const wrong = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'NOPE2345' },
      ...as(SAM),
    });
    expect(wrong.statusCode).toBe(400);
  });

  it('shows an invitation only to its identifier, who accepts and later leaves', async () => {
    const [invite] = await myLinks(SAM);
    expect(invite).toMatchObject({ id: INVITE, status: 'invited', companyName: 'Acme Haulage' });

    const snoop = await app.inject({
      method: 'POST',
      url: `/fleet/links/${INVITE}/respond`,
      payload: { accept: true },
      ...as(PAT),
    });
    expect(snoop.statusCode).toBe(404);

    const accepted = await app.inject({
      method: 'POST',
      url: `/fleet/links/${INVITE}/respond`,
      payload: { accept: true },
      ...as(SAM),
    });
    expect(accepted.json()).toMatchObject({ status: 'active', driverId: SAM });
    const left = await app.inject({
      method: 'POST',
      url: `/fleet/links/${INVITE}/leave`,
      ...as(SAM),
    });
    expect(left.json()).toMatchObject({ status: 'left' });

    const { rows } = await ownerPool.query<{ event_type: string }>(
      `select event_type from outbox.events where aggregate_id = $1 order by event_type`,
      [INVITE],
    );
    expect(rows.map((r) => r.event_type)).toEqual(['DriverJoinedFleet', 'DriverLeftFleet']);
  });
});
