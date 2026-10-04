import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const ACME_VEHICLE = 'a0000000-0000-4000-8000-000000000001';
const BETA_VEHICLE = 'b0000000-0000-4000-8000-000000000001';
const PLATFORM_STAFF = '00000000-0000-4000-8000-00000000000a';
const ACME_STAFF = '00000000-0000-4000-8000-00000000000b';
const BETA_STAFF = '00000000-0000-4000-8000-00000000000c';

/**
 * P2-M1.7's proof that Row-Level Security is actually in force (AGENTS.md "fail closed"): core
 * connects as `wagonwise_app`, exactly as production will with APP_DATABASE_URL set, through the
 * real `PostgresDataScopes`, and tries to cross from one company into another. The owner
 * connection is the control: it sees both companies' rows, so a pass here can't be an empty
 * table or a policy that was never switched on.
 */
describe('Row-Level Security (migration 0021) as wagonwise_app', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let scopes: PostgresDataScopes;
  let db: Kysely<Record<string, unknown>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined); // a pool is torn down with its container
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);

    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    // One connection, so every test also shows a scope's settings don't outlive it.
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined); // a pool is torn down with its container
    scopes = new PostgresDataScopes(appPool);
    db = new Kysely({ dialect: new PostgresDialect({ pool: scopes.pool }) });

    await ownerPool.query(`
      insert into companies.companies (id, name, created_at)
        values ('${ACME}', 'Acme', now()), ('${BETA}', 'Beta', now());
      insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
        values ('${ACME_VEHICLE}', '${ACME}', 'Acme 1', 4, 2.5, 16, 44),
               ('${BETA_VEHICLE}', '${BETA}', 'Beta 1', 4, 2.5, 16, 44);
      insert into companies.staff_accounts
        (id, kind, company_id, email, name, created_at, password_hash, second_factor_method)
        values ('${PLATFORM_STAFF}', 'platform', null, 'ww@example.com', 'WW', now(), 'h', 'email'),
               ('${ACME_STAFF}', 'fleet', '${ACME}', 'a@example.com', 'A', now(), 'h', 'email'),
               ('${BETA_STAFF}', 'fleet', '${BETA}', 'b@example.com', 'B', now(), 'h', 'email');
      insert into companies.staff_sessions
        (id, staff_id, refresh_token_hash, issued_at, last_used_at, refresh_expires_at)
        select gen_random_uuid(), id, 'r-' || name, now(), now(), now() + interval '7 days'
        from companies.staff_accounts;
    `);
  }, 120_000);

  afterAll(async () => {
    await db.destroy(); // ends appPool
    await ownerPool.end();
    await container.stop();
  });

  const vehicleNames = async () =>
    (
      await sql<{ name: string }>`select name from fleet.vehicles order by name`.execute(db)
    ).rows.map((r) => r.name);

  const staffNames = async () =>
    (
      await sql<{ name: string }>`select name from companies.staff_accounts order by name`.execute(
        db,
      )
    ).rows.map((r) => r.name);

  it('control: the owner sees both companies, so the empty results below are the policy', async () => {
    const { rows } = await ownerPool.query('select count(*)::int as n from fleet.vehicles');
    expect(rows[0]).toEqual({ n: 2 });
  });

  it('really is connected as a role that is neither owner nor superuser', async () => {
    const { rows } = await sql<{
      who: string;
      superuser: boolean;
    }>`select current_user as who, rolsuper as superuser from pg_roles where rolname = current_user`.execute(
      db,
    );
    expect(rows[0]).toEqual({ who: 'wagonwise_app', superuser: false });
  });

  it('outside any scope, protected tables show and accept nothing', async () => {
    expect(await vehicleNames()).toEqual([]);
    expect(await staffNames()).toEqual([]);
    await expect(
      sql`insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
          values (gen_random_uuid(), ${ACME}, 'x', 4, 2.5, 16, 44)`.execute(db),
    ).rejects.toThrow(/row-level security/);
  });

  it("a company scope sees only that company's rows and can't touch the other's", async () => {
    await scopes.run({ kind: 'company', companyId: ACME }, async () => {
      expect(await vehicleNames()).toEqual(['Acme 1']);
      expect(await staffNames()).toEqual(['A']);

      const updated = await sql`update fleet.vehicles set name = 'hacked'`.execute(db);
      expect(updated.numAffectedRows).toBe(1n); // Acme's only
      const deleted = await sql`delete from fleet.vehicles where id = ${BETA_VEHICLE}`.execute(db);
      expect(deleted.numAffectedRows).toBe(0n);
      const revoked = await sql`update companies.staff_sessions set revoked_at = now()`.execute(db);
      expect(revoked.numAffectedRows).toBe(1n); // sessions follow their account
    });
    await expect(
      scopes.run({ kind: 'company', companyId: ACME }, () =>
        sql`insert into fleet.vehicles (id, company_id, name, height_m, width_m, length_m, gross_weight_t)
            values (gen_random_uuid(), ${BETA}, 'planted', 4, 2.5, 16, 44)`.execute(db),
      ),
    ).rejects.toThrow(/row-level security/);

    const { rows } = await ownerPool.query<{ name: string }>(
      'select name from fleet.vehicles order by name',
    );
    expect(rows.map((r) => r.name)).toEqual(['Beta 1', 'hacked']);
    const { rows: live } = await ownerPool.query<{ n: number }>(
      'select count(*)::int as n from companies.staff_sessions where revoked_at is null',
    );
    expect(live[0]?.n).toBe(2);
  });

  it('the platform scope (WagonWise admins) sees every company', async () => {
    await scopes.run({ kind: 'platform' }, async () => {
      expect(await vehicleNames()).toEqual(['Beta 1', 'hacked']);
      expect(await staffNames()).toEqual(['A', 'B', 'WW']);
    });
  });

  it('the staff-auth scope sees staff accounts, but no company data', async () => {
    await scopes.run({ kind: 'staff-auth' }, async () => {
      expect(await staffNames()).toEqual(['A', 'B', 'WW']);
      expect(await vehicleNames()).toEqual([]);
    });
  });

  it("a scope's settings end with it: the same connection sees nothing afterwards", async () => {
    await scopes.run({ kind: 'platform' }, async () => {
      expect(await vehicleNames()).toHaveLength(2);
    });
    expect(await vehicleNames()).toEqual([]);
    const { rows } = await sql<{
      v: string | null;
    }>`select current_setting('app.platform_staff', true) as v`.execute(db);
    expect(rows[0]?.v ?? '').toBe('');
  });

  it('rolls everything back when the work throws', async () => {
    await expect(
      scopes.run({ kind: 'company', companyId: BETA }, async () => {
        await sql`update fleet.vehicles set name = 'half-done'`.execute(db);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const { rows } = await ownerPool.query<{ name: string }>(
      `select name from fleet.vehicles where id = '${BETA_VEHICLE}'`,
    );
    expect(rows[0]?.name).toBe('Beta 1');
  });

  it('refuses a transaction or a second scope inside a scope', async () => {
    await expect(
      scopes.run({ kind: 'platform' }, () => db.transaction().execute(() => Promise.resolve())),
    ).rejects.toThrow(/no transactions inside DataScopes.run/);
    await expect(
      scopes.run({ kind: 'platform' }, () =>
        scopes.run({ kind: 'platform' }, () => Promise.resolve()),
      ),
    ).rejects.toThrow(/must not be nested/);
  });

  it('the audit log is append-only for the app, and filtered by company like the rest', async () => {
    const insertAudit = (companyId: string) =>
      sql`insert into companies.staff_audit (id, at, action, company_id)
          values (gen_random_uuid(), now(), 'signed_in', ${companyId})`.execute(db);

    await scopes.run({ kind: 'company', companyId: ACME }, () => insertAudit(ACME));
    await expect(
      scopes.run({ kind: 'company', companyId: ACME }, () => insertAudit(BETA)),
    ).rejects.toThrow(/row-level security/);
    await scopes.run({ kind: 'platform' }, () => insertAudit(BETA));

    await scopes.run({ kind: 'company', companyId: ACME }, async () => {
      const { rows } = await sql<{ n: number }>`
        select count(*)::int as n from companies.staff_audit`.execute(db);
      expect(rows[0]?.n).toBe(1);
    });
    await expect(
      scopes.run({ kind: 'platform' }, () =>
        sql`update companies.staff_audit set action = 'staff_removed'`.execute(db),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      scopes.run({ kind: 'platform' }, () => sql`delete from companies.staff_audit`.execute(db)),
    ).rejects.toThrow(/permission denied/);
  });

  it('never reports success when a failed statement inside the scope was swallowed', async () => {
    // A failed statement aborts the transaction; Postgres then turns COMMIT into a silent
    // ROLLBACK. The scope must throw, not return as if the earlier write had been saved.
    await expect(
      scopes.run({ kind: 'platform' }, async () => {
        await sql`update fleet.vehicles set name = 'lost' where id = ${BETA_VEHICLE}`.execute(db);
        await sql`select 1 / 0`.execute(db).catch(() => undefined);
        return 'looked fine';
      }),
    ).rejects.toThrow(/rolled back/);
    const { rows } = await ownerPool.query<{ name: string }>(
      `select name from fleet.vehicles where id = '${BETA_VEHICLE}'`,
    );
    expect(rows[0]?.name).toBe('Beta 1');
  });

  describe('driver links (migration 0028)', () => {
    const DRIVER_1 = 'd1000000-0000-4000-8000-000000000001';
    const DRIVER_2 = 'd2000000-0000-4000-8000-000000000002';
    const insertLink = (id: string, company: string, driver: string | null, ident: string | null) =>
      sql`insert into fleet.driver_links
            (id, company_id, driver_id, invited_identifier, status, created_at)
          values (${id}, ${company}, ${driver}, ${ident},
                  ${driver === null ? 'invited' : 'requested'}, now())`.execute(db);
    const linkIds = async () =>
      (
        await sql<{ id: string }>`select id from fleet.driver_links order by id`.execute(db)
      ).rows.map((r) => r.id);

    beforeAll(async () => {
      await ownerPool.query(`
        insert into fleet.driver_links (id, company_id, driver_id, invited_identifier, status, created_at)
          values ('a1000000-0000-4000-8000-000000000001', '${ACME}', '${DRIVER_1}', null, 'active', now()),
                 ('a1000000-0000-4000-8000-000000000002', '${BETA}', '${DRIVER_2}', null, 'active', now()),
                 ('a1000000-0000-4000-8000-000000000003', '${BETA}', null, 'pat@example.com', 'invited', now()),
                 ('a1000000-0000-4000-8000-000000000004', '${ACME}', null, 'sam@example.com', 'invited', now());
        insert into fleet.company_codes (company_id, code, created_at)
          values ('${ACME}', 'ABCD2345', now()), ('${BETA}', 'WXYZ6789', now());
      `);
    });

    it('a company sees only its own links, and a driver sees theirs plus invitations for them', async () => {
      await scopes.run({ kind: 'company', companyId: ACME }, async () => {
        expect(await linkIds()).toEqual([
          'a1000000-0000-4000-8000-000000000001',
          'a1000000-0000-4000-8000-000000000004',
        ]);
      });
      await scopes.run(
        { kind: 'driver', driverId: DRIVER_1, identifier: 'pat@example.com' },
        async () => {
          expect(await linkIds()).toEqual([
            'a1000000-0000-4000-8000-000000000001',
            'a1000000-0000-4000-8000-000000000003',
          ]);
        },
      );
      expect(await linkIds()).toEqual([]); // outside any scope: nothing
    });

    it("a driver can ask to join for themselves, not for someone else, and can't touch others' links", async () => {
      const driver = { kind: 'driver', driverId: DRIVER_1, identifier: 'pat@example.com' } as const;
      await scopes.run(driver, () =>
        insertLink('a1000000-0000-4000-8000-000000000005', BETA, DRIVER_1, null),
      );
      await expect(
        scopes.run(driver, () =>
          insertLink('a1000000-0000-4000-8000-000000000006', BETA, DRIVER_2, null),
        ),
      ).rejects.toThrow(/row-level security/);
      await scopes.run(driver, async () => {
        const r = await sql`update fleet.driver_links set status = 'left'
                            where id = 'a1000000-0000-4000-8000-000000000002'`.execute(db);
        expect(r.numAffectedRows).toBe(0n);
      });
    });

    it('company codes are the company’s alone, but a driver can turn an exact code into a company', async () => {
      const driver = { kind: 'driver', driverId: DRIVER_1, identifier: 'pat@example.com' } as const;
      await scopes.run(driver, async () => {
        const all = await sql`select code from fleet.company_codes`.execute(db);
        expect(all.rows).toEqual([]);
        const hit = await sql<{
          c: string | null;
        }>`select fleet.company_for_code('ABCD2345') as c`.execute(db);
        expect(hit.rows[0]?.c).toBe(ACME);
        const miss = await sql<{
          c: string | null;
        }>`select fleet.company_for_code('NOPE2345') as c`.execute(db);
        expect(miss.rows[0]?.c).toBeNull();
      });
      await scopes.run({ kind: 'company', companyId: BETA }, async () => {
        const mine = await sql<{ code: string }>`select code from fleet.company_codes`.execute(db);
        expect(mine.rows).toEqual([{ code: 'WXYZ6789' }]);
      });
    });

    it('allows one live link per company and driver, and one pending invite per identifier', async () => {
      await expect(
        ownerPool.query(
          `insert into fleet.driver_links (id, company_id, driver_id, status, created_at)
           values ('a1000000-0000-4000-8000-000000000007', '${ACME}', '${DRIVER_1}', 'requested', now())`,
        ),
      ).rejects.toThrow(/driver_links_live_driver_idx/);
      await expect(
        ownerPool.query(
          `insert into fleet.driver_links (id, company_id, invited_identifier, status, created_at)
           values ('a1000000-0000-4000-8000-000000000008', '${ACME}', 'sam@example.com', 'invited', now())`,
        ),
      ).rejects.toThrow(/driver_links_pending_invite_idx/);
    });
  });

  describe('jobs driver scope (migration 0030)', () => {
    const JOB_DRIVER_1 = 'e1000000-0000-4000-8000-000000000001';
    const JOB_DRIVER_2 = 'e2000000-0000-4000-8000-000000000002';
    const ACME_JOB = 'c1000000-0000-4000-8000-000000000001';
    const BETA_JOB = 'c2000000-0000-4000-8000-000000000002';

    beforeAll(async () => {
      await ownerPool.query(`
        insert into jobs.jobs (id, company_id, reference, status, driver_id, created_at)
          values ('${ACME_JOB}', '${ACME}', 'ACME-1', 'assigned', '${JOB_DRIVER_1}', now()),
                 ('${BETA_JOB}', '${BETA}', 'BETA-1', 'assigned', '${JOB_DRIVER_2}', now());
      `);
    });

    const jobIds = async () =>
      (await sql<{ id: string }>`select id from jobs.jobs order by id`.execute(db)).rows.map(
        (r) => r.id,
      );

    it('a company sees only its own jobs, and a driver sees only the job assigned to them', async () => {
      await scopes.run({ kind: 'company', companyId: ACME }, async () => {
        expect(await jobIds()).toEqual([ACME_JOB]);
      });
      await scopes.run(
        { kind: 'driver', driverId: JOB_DRIVER_1, identifier: 'driver1@example.com' },
        async () => {
          expect(await jobIds()).toEqual([ACME_JOB]);
        },
      );
      await scopes.run(
        { kind: 'driver', driverId: JOB_DRIVER_2, identifier: 'driver2@example.com' },
        async () => {
          expect(await jobIds()).toEqual([BETA_JOB]);
        },
      );
      expect(await jobIds()).toEqual([]); // outside any scope: nothing
    });

    it("a driver can update their own job's status but not reach another driver's", async () => {
      const driver1 = {
        kind: 'driver',
        driverId: JOB_DRIVER_1,
        identifier: 'driver1@example.com',
      } as const;
      await scopes.run(driver1, async () => {
        const r =
          await sql`update jobs.jobs set status = 'accepted' where id = ${ACME_JOB}`.execute(db);
        expect(r.numAffectedRows).toBe(1n);
      });
      await scopes.run(driver1, async () => {
        const r =
          await sql`update jobs.jobs set status = 'accepted' where id = ${BETA_JOB}`.execute(db);
        expect(r.numAffectedRows).toBe(0n);
      });
    });

    it('positions are visible, and writable, exactly to the job’s own company and driver', async () => {
      const driver1 = {
        kind: 'driver',
        driverId: JOB_DRIVER_1,
        identifier: 'driver1@example.com',
      } as const;
      const insertFor = (jobId: string) =>
        sql`insert into jobs.job_positions (job_id, recorded_at, location)
            values (${jobId}, now(), ST_SetSRID(ST_MakePoint(-2.1, 54.9), 4326)::geography)`.execute(
          db,
        );
      const count = async () =>
        Number(
          (await sql<{ n: string }>`select count(*) as n from jobs.job_positions`.execute(db))
            .rows[0]?.n,
        );

      await scopes.run(driver1, async () => {
        await insertFor(ACME_JOB); // their own job: allowed
        expect(await count()).toBe(1);
      });
      // Its own scope: a refused insert aborts the transaction it runs in.
      await expect(
        scopes.run(driver1, async () => {
          await insertFor(BETA_JOB);
        }),
      ).rejects.toThrow(/row-level security/);
      await scopes.run({ kind: 'company', companyId: ACME }, async () => {
        expect(await count()).toBe(1);
      });
      await scopes.run({ kind: 'company', companyId: BETA }, async () => {
        expect(await count()).toBe(0);
      });
      expect(await count()).toBe(0); // outside any scope: nothing
    });
  });

  it('every table with a company_id has RLS', async () => {
    const { rows } = await ownerPool.query<{ name: string }>(`
      select c.table_schema || '.' || c.table_name as name
      from information_schema.columns c
      join pg_class t on t.relname = c.table_name
      join pg_namespace n on n.oid = t.relnamespace and n.nspname = c.table_schema
      where c.column_name = 'company_id' and t.relkind = 'r' and not t.relrowsecurity
      order by 1`);
    // identity.drivers.company_id (the one knowing exception here) is gone as of P2-M2.8,
    // replaced by fleet.driver_links, which does have RLS (migration 0028).
    expect(rows.map((r) => r.name)).toEqual([]);
  });
});
