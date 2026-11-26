import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTachographModule,
  type StaffCaller,
  type TachographModule,
} from '../modules/tachograph/api.js';
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
const SAM_VEHICLE = 'e0000000-0000-4000-8000-000000000001';
const MANAGER = '50000000-0000-4000-8000-000000000001';
const DISPATCHER = '50000000-0000-4000-8000-000000000002';
const RIVAL = '50000000-0000-4000-8000-000000000003';

const staff: Record<string, StaffCaller> = {
  [MANAGER]: { kind: 'fleet', companyId: ACME as never, privileges: ['manage_fleet'] },
  [DISPATCHER]: { kind: 'fleet', companyId: ACME as never, privileges: ['dispatch'] },
  [RIVAL]: { kind: 'fleet', companyId: BETA as never, privileges: ['manage_fleet'] },
};
const identifiers: Record<string, string> = { [SAM]: 'sam@example.com', [KIM]: 'kim@example.com' };

interface Listed {
  latest: { id: string; kind: string }[];
  recent: unknown[];
}
const jsonOf = <T>(response: { json: () => unknown }): T => response.json() as T;

const bytes = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256)); // not text: every byte value must survive
const send = {
  fileName: 'C_sam.DDD',
  downloadedOn: '2026-11-20',
  dataBase64: bytes.toString('base64'),
  wordingVersion: 1,
};

/**
 * Tachograph files, on real Postgres with Row-Level Security: the bytes come back exactly as sent, a driver can send only their own
 * card file and only to a firm they drive for that has switched it on, another company sees none of it, and files past their
 * retention go.
 */
describe('tachograph files end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let tachograph: TachographModule;
  const clock = new FakeClock('2026-11-26T09:00:00.000Z');
  let n = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    // Sam drives for ACME. Kim drives for BETA.
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
    tachograph = createTachographModule({
      db,
      clock,
      ids: {
        newId: () => `a0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
      },
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
      roster: {
        isActiveDriver: (companyId, driverId) =>
          Promise.resolve(
            (companyId === ACME && driverId === SAM) || (companyId === BETA && driverId === KIM),
          ),
        hasVehicle: (companyId, vehicleId) =>
          Promise.resolve(companyId === ACME && vehicleId === SAM_VEHICLE),
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
    tachograph.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (id: string) => ({ headers: { 'x-test-staff-id': id } });
  const asDriver = (id: string) => ({ headers: { 'x-test-driver-id': id } });
  const count = async () =>
    (
      (await ownerPool.query(`select count(*)::int as n from tachograph.files`)).rows[0] as {
        n: number;
      }
    ).n;
  const sendCard = (driver: string, company: string, body: object = send) =>
    app.inject({
      method: 'POST',
      url: `/tachograph/companies/${company}/files`,
      payload: body,
      ...asDriver(driver),
    });
  const files = (who: string, company = ACME) =>
    app.inject({ method: 'GET', url: `/staff/tachograph/companies/${company}/files`, ...as(who) });

  it('starts off: the driver is offered nothing and cannot send until the firm switches it on', async () => {
    const mine = await app.inject({ method: 'GET', url: '/tachograph/mine', ...asDriver(SAM) });
    expect(mine.json()).toEqual({
      companies: [{ companyId: ACME, companyName: 'Acme Haulage', firmEnabled: false }],
    });
    const refused = await sendCard(SAM, ACME);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ tag: 'FirmNotEnabled' });
    expect(await count()).toBe(0);
  });

  it("lets only the firm's fleet managers change the choices", async () => {
    const url = `/staff/tachograph/companies/${ACME}/settings`;
    const body = { driversMaySend: true, retentionMonths: 12 };
    expect(
      (await app.inject({ method: 'PUT', url, payload: body, ...as(DISPATCHER) })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'PUT', url, payload: body, ...as(RIVAL) })).statusCode).toBe(
      403,
    );
    expect(
      (await app.inject({ method: 'PUT', url, payload: body, ...as(MANAGER) })).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url, ...as(MANAGER) })).json()).toEqual(body);
    // A driver of the firm may read it (to see whether to offer sending), through the policy, not the staff route.
    const mine = await app.inject({ method: 'GET', url: '/tachograph/mine', ...asDriver(SAM) });
    expect(jsonOf<{ companies: object[] }>(mine).companies[0]).toMatchObject({ firmEnabled: true });
  });

  it("keeps the driver's file exactly as sent, once, and tells them when they send it again", async () => {
    const first = await sendCard(SAM, ACME);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ duplicate: false });
    const again = await sendCard(SAM, ACME, { ...send, downloadedOn: '2026-11-25' });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ duplicate: true });
    expect(await count()).toBe(1);

    const stored = (
      await ownerPool.query(`select data, sha256, uploaded_by_driver_id from tachograph.files`)
    ).rows[0] as {
      data: Buffer;
      sha256: string;
      uploaded_by_driver_id: string;
    };
    expect(Buffer.from(stored.data).equals(bytes)).toBe(true);
    expect(stored.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(stored.uploaded_by_driver_id).toBe(SAM);

    const mine = await app.inject({ method: 'GET', url: '/tachograph/mine', ...asDriver(SAM) });
    expect(jsonOf<{ companies: object[] }>(mine).companies[0]).toMatchObject({
      lastDownloadedOn: '2026-11-20',
    });
  });

  it('shows the manager the file in the tracker and hands it back byte for byte', async () => {
    const listed = jsonOf<Listed>(await files(MANAGER));
    expect(listed.latest).toHaveLength(1);
    expect(listed.latest[0]).toMatchObject({
      kind: 'driver_card',
      driverId: SAM,
      downloadedOn: '2026-11-20',
      fileName: 'C_sam.DDD',
      sizeBytes: 300,
      source: 'driver_app',
    });
    const id = listed.latest[0]?.id ?? '';
    const got = jsonOf<{ dataBase64: string; sha256: string }>(
      await app.inject({
        method: 'GET',
        url: `/staff/tachograph/companies/${ACME}/files/${id}`,
        ...as(MANAGER),
      }),
    );
    expect(Buffer.from(got.dataBase64, 'base64').equals(bytes)).toBe(true);
    expect(got.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    // Not for a dispatcher, and not for another company.
    expect((await files(DISPATCHER)).statusCode).toBe(403);
    expect((await files(RIVAL, ACME)).statusCode).toBe(403);
    expect(jsonOf<Listed>(await files(RIVAL, BETA)).latest).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/staff/tachograph/companies/${BETA}/files/${id}`,
          ...as(RIVAL),
        })
      ).statusCode,
    ).toBe(404);
  });

  it("takes a vehicle unit file from the office, for the firm's own vehicle only", async () => {
    const url = `/staff/tachograph/companies/${ACME}/files`;
    const unit = Buffer.from('vehicle unit bytes');
    const body = {
      kind: 'vehicle_unit',
      vehicleId: SAM_VEHICLE,
      fileName: 'V_ab12.ddd',
      downloadedOn: '2026-10-01',
      dataBase64: unit.toString('base64'),
    };
    expect(
      (await app.inject({ method: 'POST', url, payload: body, ...as(MANAGER) })).statusCode,
    ).toBe(201);
    const wrong = await app.inject({
      method: 'POST',
      url,
      payload: {
        ...body,
        vehicleId: 'e0000000-0000-4000-8000-0000000000ff',
        dataBase64: Buffer.from('x').toString('base64'),
      },
      ...as(MANAGER),
    });
    expect(wrong.statusCode).toBe(404);
    const listed = jsonOf<Listed>(await files(MANAGER));
    expect(listed.latest.map((f) => f.kind).sort()).toEqual(['driver_card', 'vehicle_unit']);
  });

  it("refuses a driver sending for someone else, to a firm they do not drive for, or past the firm's door", async () => {
    // Kim does not drive for ACME.
    expect(
      (await sendCard(KIM, ACME, { ...send, dataBase64: Buffer.from('k').toString('base64') }))
        .statusCode,
    ).toBe(404);
    // Even straight at the table, a driver cannot add a row for another driver or another company, or change or delete a file.
    const asSam = async (statement: string, params: unknown[] = []) => {
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query(`select set_config('app.driver_id', $1, true)`, [SAM]);
        const result = await client.query(statement, params);
        await client.query('rollback');
        return result.rowCount;
      } catch (error) {
        await client.query('rollback');
        return error instanceof Error ? error.message : 'failed';
      } finally {
        client.release();
      }
    };
    const insert = (company: string, driver: string, uploader: string, hash: string) =>
      asSam(
        `insert into tachograph.files (id, company_id, kind, driver_id, file_name, size_bytes, sha256, data, downloaded_on,
                                       uploaded_at, uploaded_by_driver_id)
         values (gen_random_uuid(), $1, 'driver_card', $2, 'f.ddd', 1, $4, '\\x00', '2026-11-20', now(), $3)`,
        [company, driver, uploader, hash],
      );
    expect(await insert(ACME, SAM, SAM, 'own')).toBe(1); // their own, to their own firm: allowed
    expect(await insert(BETA, SAM, SAM, 'other-firm')).toMatch(/row-level security/); // a firm they do not drive for
    expect(await insert(ACME, KIM, SAM, 'other-driver')).toMatch(/row-level security/); // someone else's card
    expect(await asSam(`update tachograph.files set file_name = 'changed'`)).toBe(0); // the firm's record: not theirs to change
    expect(await asSam(`delete from tachograph.files`)).toBe(0);
    expect(await count()).toBe(2);
  });

  it("keeps a driver to their own files and one company from another's", async () => {
    // Kim (BETA) has switched nothing on and has no files; Sam\'s are not Kim\'s to see.
    const mine = await app.inject({ method: 'GET', url: '/tachograph/mine', ...asDriver(KIM) });
    expect(mine.json()).toEqual({
      companies: [{ companyId: BETA, companyName: 'Beta Haulage', firmEnabled: false }],
    });
  });

  it("deletes a file, and prunes files past the firm's retention but not before", async () => {
    const listed = jsonOf<Listed>(await files(MANAGER));
    const unitId = listed.latest.find((f) => f.kind === 'vehicle_unit')?.id ?? '';
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/staff/tachograph/companies/${ACME}/files/${unitId}`,
          ...as(MANAGER),
        })
      ).statusCode,
    ).toBe(204);
    expect(await count()).toBe(1);

    expect(await tachograph.pruneExpiredFiles()).toBe(0);
    clock.set(new Date('2027-11-25T09:00:00.000Z')); // a day short of 12 months after it was received
    expect(await tachograph.pruneExpiredFiles()).toBe(0);
    clock.set(new Date('2027-11-27T09:00:00.000Z'));
    expect(await tachograph.pruneExpiredFiles()).toBe(1);
    expect(await count()).toBe(0);
  });

  it('refuses a retention under 12 months', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: `/staff/tachograph/companies/${ACME}/settings`,
      payload: { driversMaySend: true, retentionMonths: 6 },
      ...as(MANAGER),
    });
    expect(r.statusCode).toBe(400);
  });
});
