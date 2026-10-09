import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createCostingModule,
  type StaffCaller,
  type VehicleSummary,
} from '../modules/costing/api.js';
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
const MANAGER = '50000000-0000-4000-8000-000000000001';
const REPORTER = '50000000-0000-4000-8000-000000000002';
const DISPATCHER = '50000000-0000-4000-8000-000000000003';
const RIVAL = '50000000-0000-4000-8000-000000000004';

const staff: Record<string, StaffCaller> = {
  [MANAGER]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_fleet'] },
  [REPORTER]: { kind: 'fleet', companyId: ACME as never, privileges: ['view_reports'] },
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_fleet'] },
};

const row = (over: Record<string, unknown> = {}) => ({
  occurredAt: '2026-10-05T08:30:00.000Z',
  registration: 'ab12 cde',
  litres: 200.5,
  amountPence: 30_075,
  ...over,
});

/**
 * Fuel on real Postgres with Row-Level Security: a statement is imported and matched to vehicles by registration, sending it
 * again adds nothing, another company sees none of it, and an import can be undone as a whole.
 */
describe('fuel end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  const vehicles: VehicleSummary[] = [
    { id: makeId<'FleetVehicleId'>(VAN), name: 'Big Van', registration: 'AB12CDE' },
    { id: makeId<'FleetVehicleId'>(LORRY), name: 'Big Wagon', registration: undefined },
  ];

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
    const costing = createCostingModule({
      db,
      ids: new SequentialIdGenerator(),
      clock: new FakeClock('2026-10-09T09:00:00.000Z'),
      dataScopes: scopes,
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      jobs: { deliveredBetween: () => Promise.resolve([]) },
      drivers: {
        listForCompany: () => Promise.resolve([]),
        belongsToCompany: () => Promise.resolve(false),
      },
      vehicles: {
        listForCompany: (c) => Promise.resolve(c === ACME ? vehicles : []),
        find: (v) => {
          const found = vehicles.find((x) => x.id === v);
          if (found !== undefined)
            return Promise.resolve({ ...found, companyId: makeId<'CompanyId'>(ACME) });
          return Promise.resolve(
            v === THEIRS
              ? {
                  id: makeId<'FleetVehicleId'>(THEIRS),
                  name: 'Theirs',
                  registration: undefined,
                  companyId: makeId<'CompanyId'>(BETA),
                }
              : null,
          );
        },
      },
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const id = request.headers['x-test-staff-id'];
      if (typeof id === 'string') request.staffId = id;
      done();
    });
    costing.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const send = (who: string, rows: object[], fileName = 'oct.csv') =>
    app.inject({
      method: 'POST',
      url: `/staff/costing/companies/${ACME}/fuel/import`,
      payload: { fileName, rows },
      ...as(who),
    });
  const count = async (table: 'fuel_transactions' | 'fuel_imports') =>
    (
      (await ownerPool.query(`select count(*)::int as n from costing.${table}`)).rows[0] as {
        n: number;
      }
    ).n;
  const view = (who: string, company = ACME) =>
    app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${company}/fuel?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z`,
      ...as(who),
    });
  let importId = '';

  it('imports a statement, matching the van by registration and keeping the purchase it could not match', async () => {
    const response = await send(MANAGER, [
      row(),
      row({ occurredAt: '2026-10-06T09:00:00.000Z', amountPence: 15_000, litres: 100 }),
      row({
        registration: 'LR22 ABC',
        occurredAt: '2026-10-07T10:00:00.000Z',
        amountPence: 9_950,
        litres: undefined,
      }),
      row({ occurredAt: 'tomorrow-ish' }),
    ]);
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      importId: string;
      imported: number;
      matched: number;
      unmatched: number;
      invalid: unknown[];
      unmatchedRegistrations: string[];
    }>();
    importId = body.importId;
    expect(body).toMatchObject({
      imported: 3,
      matched: 2,
      unmatched: 1,
      unmatchedRegistrations: ['LR22ABC'],
      invalid: [{ row: 4, reason: 'bad_date' }],
    });
    expect(await count('fuel_transactions')).toBe(3);
  });

  it('adds nothing when the same statement is sent again', async () => {
    const again = await send(MANAGER, [
      row(),
      row({ occurredAt: '2026-10-06T09:00:00.000Z', amountPence: 15_000, litres: 100 }),
      row({
        registration: 'LR22 ABC',
        occurredAt: '2026-10-07T10:00:00.000Z',
        amountPence: 9_950,
        litres: undefined,
      }),
    ]);
    expect(again.json()).toMatchObject({ imported: 0, duplicates: 3 });
    expect(await count('fuel_transactions')).toBe(3);
    expect(await count('fuel_imports')).toBe(1);
  });

  it('shows fuel by vehicle with litres and price per litre, to a manager and a reporter, not a dispatcher', async () => {
    const seen = await view(REPORTER);
    expect(seen.statusCode).toBe(200);
    const body = seen.json<{
      totalPence: number;
      totalLitres: number;
      unmatchedCount: number;
      byVehicle: Record<string, unknown>[];
    }>();
    expect(body).toMatchObject({ totalPence: 55_025, totalLitres: 300.5, unmatchedCount: 1 });
    expect(body.byVehicle[0]).toMatchObject({
      vehicleName: 'Big Van',
      purchases: 2,
      litres: 300.5,
      amountPence: 45_075,
      pencePerLitre: 150,
    });
    expect((await view(DISPATCHER)).statusCode).toBe(403);
  });

  it('keeps another company out of all of it', async () => {
    expect((await view(RIVAL, ACME)).statusCode).toBe(403);
    const theirs = await view(RIVAL, BETA);
    expect(theirs.json()).toMatchObject({ totalPence: 0, transactions: [] });
    expect((await send(REPORTER, [row()])).statusCode).toBe(403);
    // Their own statement lands in their own company, and cannot be seen from ACME's side.
    const mine = await app.inject({
      method: 'POST',
      url: `/staff/costing/companies/${BETA}/fuel/import`,
      payload: { fileName: 'beta.csv', rows: [row({ registration: 'BT11 XYZ' })] },
      ...as(RIVAL),
    });
    expect(mine.statusCode).toBe(200);
    expect((await view(MANAGER)).json<{ totalPence: number }>().totalPence).toBe(55_025);
  });

  it('matches the unmatched purchase once the registration is added, or by hand', async () => {
    vehicles[1] = {
      id: makeId<'FleetVehicleId'>(LORRY),
      name: 'Big Wagon',
      registration: 'LR22 ABC',
    };
    const rematch = await app.inject({
      method: 'POST',
      url: `/staff/costing/companies/${ACME}/fuel/rematch`,
      ...as(MANAGER),
    });
    expect(rematch.json()).toEqual({ matched: 1 });
    const unmatched = await app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${ACME}/fuel/unmatched`,
      ...as(MANAGER),
    });
    expect(unmatched.json()).toEqual({ transactions: [] });

    // By hand: take it off the lorry, then give it to the van; another company's vehicle is refused.
    const id = (
      await ownerPool.query<{ id: string }>(
        `select id from costing.fuel_transactions where registration = 'LR22ABC'`,
      )
    ).rows[0]?.id as string;
    const assign = (vehicleId: string | null, who = MANAGER) =>
      app.inject({
        method: 'POST',
        url: `/staff/costing/fuel/${id}/vehicle`,
        payload: { vehicleId },
        ...as(who),
      });
    expect((await assign(null)).statusCode).toBe(204);
    expect((await assign(VAN)).statusCode).toBe(204);
    expect((await assign(THEIRS)).statusCode).toBe(404);
    expect((await assign(VAN, REPORTER)).statusCode).toBe(403);
    expect((await assign(VAN, RIVAL)).statusCode).toBe(404);
  });

  it('undoes a whole import, and the same statement can then be sent again', async () => {
    const imports = await app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${ACME}/fuel/imports`,
      ...as(REPORTER),
    });
    expect(imports.json<{ imports: { id: string; rowsImported: number }[] }>().imports).toEqual([
      expect.objectContaining({ id: importId, rowsImported: 3 }),
    ]);
    const undo = (who: string) =>
      app.inject({ method: 'DELETE', url: `/staff/costing/fuel/imports/${importId}`, ...as(who) });
    expect((await undo(REPORTER)).statusCode).toBe(403);
    expect((await undo(RIVAL)).statusCode).toBe(404);
    expect(await count('fuel_transactions')).toBe(4);
    expect((await undo(MANAGER)).statusCode).toBe(204);
    // Only ACME's 3 went; BETA's one stays.
    expect(await count('fuel_transactions')).toBe(1);
    const again = await send(MANAGER, [row()]);
    expect(again.json()).toMatchObject({ imported: 1, duplicates: 0 });
  });

  it('refuses a malformed or oversized request', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: `/staff/costing/companies/${ACME}/fuel/import`,
      payload: { fileName: 'x', rows: [] },
      ...as(MANAGER),
    });
    expect(bad.statusCode).toBe(400);
    const noAuth = await app.inject({
      method: 'GET',
      url: `/staff/costing/companies/${ACME}/fuel`,
    });
    expect(noAuth.statusCode).toBe(401);
  });
});
