import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Cost } from '../domain/finance.js';
import type { UntypedDb } from './db.js';
import { PostgresCostRepository } from './postgres-cost-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const admin = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const at = new Date('2026-10-09T09:00:00.000Z');

let n = 0;
const cost = (over: Partial<Cost> = {}): Cost => ({
  id: makeId<'CostId'>(`c000000${++n}-0000-4000-8000-00000000000${n}`),
  category: 'hosting',
  description: `Cost ${n}`,
  amountPence: 5000,
  fromMonth: '2026-08',
  toMonth: undefined,
  ...over,
});

describe('PostgresCostRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresCostRepository(db);

  it('round-trips a standing cost and a one-off', async () => {
    const standing = cost();
    const oneOff = cost({ category: 'other', fromMonth: '2026-09', toMonth: '2026-09' });
    await repo().insert(standing, admin, at);
    await repo().insert(oneOff, admin, at);
    expect(await repo().findById(standing.id)).toEqual(standing);
    expect(await repo().findById(oneOff.id)).toEqual(oneOff);
    expect((await repo().list()).map((c) => c.id)).toEqual(
      expect.arrayContaining([standing.id, oneOff.id]),
    );
  });

  it('changes what a row says, ends it, and lets it carry on again', async () => {
    const c = cost();
    await repo().insert(c, admin, at);
    await repo().updateFields(c.id, { category: 'maps', description: 'Maps', amountPence: 9000 });
    expect(await repo().findById(c.id)).toMatchObject({
      category: 'maps',
      description: 'Maps',
      amountPence: 9000,
      toMonth: undefined,
    });
    await repo().setToMonth(c.id, '2026-12');
    expect((await repo().findById(c.id))?.toMonth).toBe('2026-12');
    await repo().setToMonth(c.id, undefined);
    expect((await repo().findById(c.id))?.toMonth).toBeUndefined();
  });

  it('deletes a row, and finds nothing for an unknown id', async () => {
    const c = cost();
    await repo().insert(c, admin, at);
    await repo().delete(c.id);
    expect(await repo().findById(c.id)).toBeNull();
  });

  it('refuses an amount, a month or a category the schema does not allow', async () => {
    await expect(repo().insert(cost({ amountPence: -1 }), admin, at)).rejects.toThrow();
    await expect(repo().insert(cost({ fromMonth: '2026-13' }), admin, at)).rejects.toThrow();
    await expect(
      repo().insert(cost({ fromMonth: '2026-10', toMonth: '2026-09' }), admin, at),
    ).rejects.toThrow();
    await expect(
      repo().insert({ ...cost(), category: 'lunch' as never }, admin, at),
    ).rejects.toThrow();
  });
});
