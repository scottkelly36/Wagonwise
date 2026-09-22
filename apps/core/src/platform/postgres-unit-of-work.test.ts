import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool } from './db.js';
import { asKyselyTransaction, PostgresUnitOfWork } from './postgres-unit-of-work.js';
import type { Pool } from 'pg';
import type { Kysely } from 'kysely';
import type { Database } from './db.js';

/**
 * Proves the same contract `InMemoryUnitOfWork`'s tests enforce, but against a real Postgres
 * transaction: commit persists, an exception rolls back everything the callback did, and a
 * nested `run()` is rejected before it can open a second transaction. Uses raw `sql` against a
 * scratch table rather than the (intentionally empty, see db.ts) typed `Database` schema.
 */
describe('PostgresUnitOfWork', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Kysely<Database>;
  let uow: PostgresUnitOfWork;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    uow = new PostgresUnitOfWork(db);
    await sql`create table probe (id integer primary key, label text not null)`.execute(db);
  }, 120_000);

  afterAll(async () => {
    await db.destroy();
  });

  it('commits: a row written inside run() is visible afterwards', async () => {
    await uow.run(async (tx) => {
      await sql`insert into probe (id, label) values (1, 'committed')`.execute(
        asKyselyTransaction(tx),
      );
    });

    const rows = await sql<{ label: string }>`select label from probe where id = 1`.execute(db);
    expect(rows.rows).toEqual([{ label: 'committed' }]);
  });

  it('rolls back: a row written before a throw is not visible afterwards', async () => {
    await expect(
      uow.run(async (tx) => {
        await sql`insert into probe (id, label) values (2, 'should not survive')`.execute(
          asKyselyTransaction(tx),
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await sql`select id from probe where id = 2`.execute(db);
    expect(rows.rows).toEqual([]);
  });

  it('propagates the original error unchanged', async () => {
    class MarkerError extends Error {}
    await expect(
      uow.run(() => {
        throw new MarkerError('specific failure');
      }),
    ).rejects.toBeInstanceOf(MarkerError);
  });

  it('rejects a nested run() rather than silently opening a second transaction', async () => {
    await expect(
      uow.run(async () => {
        await uow.run(async () => {
          /* never reached */
        });
      }),
    ).rejects.toThrow('UnitOfWork.run must not be nested');
  });

  it('allows a fresh run() after a previous one finished (nesting guard resets)', async () => {
    await uow.run(async () => {
      /* commits trivially */
    });
    await expect(uow.run(async () => {})).resolves.toBeUndefined();
  });
});
