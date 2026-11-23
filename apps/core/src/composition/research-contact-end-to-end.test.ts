import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RESEARCH_CONTACT_WORDING } from '@wagonwise/contracts/feedback';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFeedbackModule, type StaffCaller } from '../modules/feedback/api.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '80000000-0000-4000-8000-000000000001';
const SAM = '80000000-0000-4000-8000-000000000002';
const PAT = '80000000-0000-4000-8000-000000000003';
const ACME = '81000000-0000-4000-8000-000000000001';
const BETA = '81000000-0000-4000-8000-000000000002';
const V = RESEARCH_CONTACT_WORDING.version;

const staff: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [SAM]: { kind: 'fleet', companyId: ACME, privileges: ['manage_users'] },
  [PAT]: { kind: 'fleet', companyId: BETA, privileges: ['dispatch'] },
};

/**
 * The market research contact option on real Postgres with Row-Level Security, as the restricted app role: a person's yes or no is kept
 * as a row each time with the wording version, the list shows only people whose latest answer is yes, a company cannot read or add rows
 * for another, and nobody (not even the app) can edit or delete an answer.
 */
describe('market research contact end to end (real RLS, real scopes)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  const clock = new FakeClock('2026-11-23T10:00:00.000Z');

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

    const feedback = createFeedbackModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      callers: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
      driverLabels: { labelsFor: () => Promise.resolve(new Map()) },
      dataScopes: scopes,
      staffLabels: {
        // Like the real one (companies' describeStaff), this opens a platform scope of its own: it must not be called inside another.
        describe: (ids) =>
          scopes.run({ kind: 'platform' }, () =>
            Promise.resolve(
              new Map(
                ids.map((id) => [
                  id,
                  id === SAM
                    ? { name: 'Sam Boss', email: 'sam@acme.test', companyName: 'Acme Haulage' }
                    : { name: 'Pat Other', email: 'pat@beta.test', companyName: 'Beta Freight' },
                ]),
              ),
            ),
          ),
      },
      researchContactEnabled: true,
      researchWordingVersion: V,
    });
    app = Fastify();
    app.addHook('onRequest', (request, _reply, done) => {
      const staffId = request.headers['x-test-staff-id'];
      if (typeof staffId === 'string') request.staffId = staffId;
      done();
    });
    feedback.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (who: string) => ({ headers: { 'x-test-staff-id': who } });
  const answer = (who: string, agreed: boolean) =>
    app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed, version: V },
      ...as(who),
    });
  const asRole = async (
    settings: Record<string, string>,
    work: (client: PoolClient) => Promise<void>,
  ) => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      for (const [name, value] of Object.entries(settings)) {
        await client.query('select set_config($1, $2, true)', [name, value]);
      }
      await work(client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  };

  it('keeps each answer as its own row with the company, the date and the wording version', async () => {
    expect((await answer(SAM, true)).statusCode).toBe(200);
    expect((await answer(PAT, true)).statusCode).toBe(200);
    clock.advance(60_000);
    expect((await answer(PAT, false)).statusCode).toBe(200);
    const { rows } = await ownerPool.query<{
      staff_id: string;
      company_id: string;
      agreed: boolean;
      wording_version: number;
    }>(
      `select staff_id, company_id, agreed, wording_version from feedback.research_consent order by at, agreed desc`,
    );
    expect(rows.map((r) => [r.staff_id, r.company_id, r.agreed, r.wording_version])).toEqual([
      [SAM, ACME, true, V],
      [PAT, BETA, true, V],
      [PAT, BETA, false, V],
    ]);
  });

  it("reads back a person's own latest answer", async () => {
    const sam = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(SAM) });
    expect(sam.json()).toMatchObject({ available: true, agreed: true });
    const pat = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(PAT) });
    expect(pat.json()).toMatchObject({ agreed: false });
  });

  it('lists to WagonWise staff only the people whose latest answer is yes', async () => {
    const list = await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(ADMIN) });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ people: { name: string; company: string }[] }>().people).toEqual([
      expect.objectContaining({ name: 'Sam Boss', company: 'Acme Haulage' }),
    ]);
    expect(
      (await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(SAM) })).statusCode,
    ).toBe(403);
  });

  it('row-level security: a company sees and adds only its own rows, WagonWise staff see all', async () => {
    await asRole({ 'app.company_id': BETA }, async (c) => {
      const seen = await c.query('select staff_id from feedback.research_consent');
      expect((seen.rows as { staff_id: string }[]).every((r) => r.staff_id === PAT)).toBe(true);
      await expect(
        c.query(
          `insert into feedback.research_consent (id, staff_id, company_id, agreed, wording_version)
           values (gen_random_uuid(), $1, $2, true, 1)`,
          [SAM, ACME],
        ),
      ).rejects.toThrow();
    });
    await asRole({ 'app.platform_staff': 'on' }, async (c) => {
      const seen = await c.query('select count(*)::int as n from feedback.research_consent');
      expect((seen.rows[0] as { n: number }).n).toBe(3);
    });
  });

  it('nobody can edit or delete an answer, not even the app', async () => {
    for (const settings of [{ 'app.platform_staff': 'on' }, { 'app.company_id': ACME }]) {
      await asRole(settings, async (c) => {
        await expect(
          c.query(`update feedback.research_consent set agreed = false`),
        ).rejects.toThrow();
      });
      await asRole(settings, async (c) => {
        await expect(c.query(`delete from feedback.research_consent`)).rejects.toThrow();
      });
    }
  });
});
