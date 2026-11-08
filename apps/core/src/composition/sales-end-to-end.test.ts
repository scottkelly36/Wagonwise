import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSalesModule, type StaffCaller } from '../modules/sales/api.js';
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
    privileges: ['manage_users'],
  },
};

interface Prospect {
  id: string;
  name: string;
  stage: string;
  nextStepOn?: string;
  nextStep?: string;
  legalForm: string;
}
interface Listing {
  prospects: Prospect[];
  entries: { id: string; prospectId: string; result: string; pitch?: string; at: string }[];
}

/**
 * The sales notebook on real Postgres with Row-Level Security: only WagonWise staff can use any route, the tables refuse the
 * app role everywhere else, a contact moves a firm on and sets its next step in one go, a firm that opted out stays on the
 * list and cannot be logged against, and the same spreadsheet imported twice adds nothing the second time.
 */
describe('sales end to end (real RLS, real scopes)', () => {
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
    const sales = createSalesModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-11-09T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    sales.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const send = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    who?: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
      ...(who === undefined ? {} : as(who)),
    });
  const listing = async (): Promise<Listing> =>
    (await send('GET', '/staff/sales', ADMIN)).json<Listing>();

  it('lets only WagonWise staff use any route', async () => {
    const routes: ['GET' | 'POST' | 'PUT' | 'DELETE', string, object?][] = [
      ['GET', '/staff/sales'],
      ['POST', '/staff/sales/prospects', { name: 'Acme' }],
      ['PUT', '/staff/sales/prospects/x', { town: 'Hexham' }],
      ['DELETE', '/staff/sales/prospects/x'],
      ['POST', '/staff/sales/prospects/x/entries', { how: 'phone', result: 'sent' }],
      ['DELETE', '/staff/sales/entries/x'],
      ['POST', '/staff/sales/import', { rows: [{ name: 'Acme' }] }],
    ];
    for (const [method, url, payload] of routes) {
      expect(
        (await send(method, url, undefined, payload)).statusCode,
        `${method} ${url} signed out`,
      ).toBe(401);
      expect((await send(method, url, FLEET, payload)).statusCode, `${method} ${url} fleet`).toBe(
        403,
      );
    }
    expect((await ownerPool.query('select count(*) as n from sales.prospects')).rows[0]).toEqual({
      n: '0',
    });
  });

  it('adds a firm, lists it, and will not add the same name twice', async () => {
    const created = await send('POST', '/staff/sales/prospects', ADMIN, {
      name: 'Hubbuck Ltd',
      town: 'Hexham',
      fleetSize: 4,
      legalForm: 'limited',
      relationship: 'warm',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Hubbuck Ltd',
      stage: 'not_contacted',
      legalForm: 'limited',
    });
    const again = await send('POST', '/staff/sales/prospects', ADMIN, { name: 'HUBBUCK LTD' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ tag: 'AlreadyListed' });
    expect((await listing()).prospects.map((p) => p.name)).toEqual(['Hubbuck Ltd']);
    expect(
      (await send('POST', '/staff/sales/prospects', ADMIN, { nonsense: true })).statusCode,
    ).toBe(400);
  });

  it('logs a contact: the entry, the new stage and the next step arrive together, and the date is the same day', async () => {
    const id = (await listing()).prospects[0]?.id ?? '';
    const logged = await send('POST', `/staff/sales/prospects/${id}/entries`, ADMIN, {
      how: 'phone',
      result: 'sent',
      pitch: 'checks',
      note: 'Left a message',
      nextStep: 'Ring back',
      nextStepOn: '2026-11-16',
    });
    expect(logged.statusCode).toBe(201);
    const after = await listing();
    expect(after.prospects[0]).toMatchObject({
      stage: 'contacted',
      nextStep: 'Ring back',
      nextStepOn: '2026-11-16',
    });
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]).toMatchObject({ prospectId: id, result: 'sent', pitch: 'checks' });

    const replied = await send('POST', `/staff/sales/prospects/${id}/entries`, ADMIN, {
      how: 'phone',
      result: 'replied',
      at: '2026-11-05T12:00:00.000Z',
    });
    expect(replied.statusCode).toBe(201);
    expect((await listing()).prospects[0]?.stage).toBe('replied');
    expect(
      (
        await send('POST', `/staff/sales/prospects/${id}/entries`, ADMIN, {
          how: 'smoke signal',
          result: 'sent',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('changes a firm, clearing a detail with null', async () => {
    const id = (await listing()).prospects[0]?.id ?? '';
    const changed = await send('PUT', `/staff/sales/prospects/${id}`, ADMIN, {
      town: null,
      phone: '01434 602417',
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ phone: '01434 602417' });
    expect(changed.json()).not.toHaveProperty('town');
    const stranger = '00000000-0000-4000-8000-0000000000ff';
    expect(
      (await send('PUT', `/staff/sales/prospects/${stranger}`, ADMIN, { town: 'x' })).statusCode,
    ).toBe(404);
    // An id that is not an id never reaches the database.
    expect(
      (await send('PUT', '/staff/sales/prospects/nope', ADMIN, { town: 'x' })).statusCode,
    ).toBe(400);
  });

  it('keeps a firm that asked not to be contacted, and refuses to log against it, move it or delete it', async () => {
    const created = await send('POST', '/staff/sales/prospects', ADMIN, { name: 'Denham Ltd' });
    const id = created.json<Prospect>().id;
    const optOut = await send('POST', `/staff/sales/prospects/${id}/entries`, ADMIN, {
      how: 'email',
      result: 'opted_out',
    });
    expect(optOut.statusCode).toBe(201);
    expect((await listing()).prospects.find((p) => p.id === id)?.stage).toBe('do_not_contact');

    const log = await send('POST', `/staff/sales/prospects/${id}/entries`, ADMIN, {
      how: 'phone',
      result: 'sent',
    });
    expect(log.statusCode).toBe(409);
    expect(log.json()).toMatchObject({ tag: 'OptedOut' });
    expect(
      (await send('PUT', `/staff/sales/prospects/${id}`, ADMIN, { stage: 'contacted' })).statusCode,
    ).toBe(409);
    expect((await send('DELETE', `/staff/sales/prospects/${id}`, ADMIN)).statusCode).toBe(409);
    expect((await listing()).prospects.some((p) => p.id === id)).toBe(true);
  });

  it('imports a spreadsheet’s rows, and adds nothing the second time', async () => {
    const rows = [
      {
        name: 'SGS Timber Haulage Ltd',
        fleetSize: '8',
        legalForm: 'Ltd',
        relationship: 'Existing contact',
      },
      { name: 'hubbuck ltd' },
      { name: 'E Dodd & Sons', legalForm: 'unsure' },
    ];
    const first = await send('POST', '/staff/sales/import', ADMIN, { rows });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      added: 2,
      skipped: [{ name: 'hubbuck ltd', reason: 'already_listed' }],
    });
    const second = await send('POST', '/staff/sales/import', ADMIN, { rows });
    expect(second.json()).toMatchObject({ added: 0 });
    const sgs = (await listing()).prospects.find((p) => p.name === 'SGS Timber Haulage Ltd');
    expect(sgs).toMatchObject({ legalForm: 'limited', stage: 'not_contacted' });
    expect((await listing()).prospects.find((p) => p.name === 'E Dodd & Sons')?.legalForm).toBe(
      'unknown',
    );
  });

  it('removes a log entry and a firm, and the firm’s log goes with it', async () => {
    const before = await listing();
    const firm = before.prospects.find((p) => p.name === 'Hubbuck Ltd');
    const entryId = before.entries.find((e) => e.prospectId === firm?.id)?.id ?? '';
    expect((await send('DELETE', `/staff/sales/entries/${entryId}`, ADMIN)).statusCode).toBe(204);
    expect((await send('DELETE', `/staff/sales/entries/${entryId}`, ADMIN)).statusCode).toBe(404);
    expect((await send('DELETE', `/staff/sales/prospects/${firm?.id}`, ADMIN)).statusCode).toBe(
      204,
    );
    const after = await listing();
    expect(after.prospects.some((p) => p.name === 'Hubbuck Ltd')).toBe(false);
    expect(after.entries.some((e) => e.prospectId === firm?.id)).toBe(false);
  });

  it('shows the app role nothing when it is not in the platform scope', async () => {
    const owner = await ownerPool.query<{ n: string }>('select count(*) as n from sales.prospects');
    expect(Number(owner.rows[0]?.n)).toBeGreaterThan(0);
    const outsideScope = await appPool.query<{ n: string }>(
      'select count(*) as n from sales.prospects',
    );
    expect(outsideScope.rows[0]).toEqual({ n: '0' });
    const entries = await appPool.query<{ n: string }>('select count(*) as n from sales.entries');
    expect(entries.rows[0]).toEqual({ n: '0' });
  });
});
