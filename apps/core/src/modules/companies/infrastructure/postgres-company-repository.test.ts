import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Company } from '../domain/company.js';
import type { UntypedDb } from './db.js';
import { PostgresCompanyRepository } from './postgres-company-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresCompanyRepository', () => {
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

  const repo = () => new PostgresCompanyRepository(db);

  function company(overrides: Partial<Company> = {}): Company {
    return {
      id: makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111'),
      name: 'Acme Haulage',
      createdAt: new Date('2026-09-27T08:00:00.000Z'),
      photoRetentionMonths: 12,
      ...overrides,
    };
  }

  it('keeps a company photo retention setting, and can change it', async () => {
    const c = company({ photoRetentionMonths: 6 });
    await repo().save(c);
    expect((await repo().findById(c.id))?.photoRetentionMonths).toBe(6);
    await repo().setPhotoRetention(c.id, 24);
    expect((await repo().findById(c.id))?.photoRetentionMonths).toBe(24);
  });

  it('round-trips a company', async () => {
    const c = company();
    await repo().save(c);
    expect(await repo().findAll()).toEqual([c]);
  });

  it('save with the same id updates the name rather than inserting a new row', async () => {
    const c = company();
    await repo().save(c);
    const renamed: Company = { ...c, name: 'Acme Haulage Ltd' };
    await repo().save(renamed);

    const all = await repo().findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Acme Haulage Ltd');
  });

  it('orders results most-recently-created first', async () => {
    const older = company({
      id: makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222'),
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const newer = company({
      id: makeId<'CompanyId'>('33333333-3333-4333-8333-333333333333'),
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    await repo().save(older);
    await repo().save(newer);

    const all = await repo().findAll();
    // Most recent first: the base `company()` fixture's own createdAt (2026-09-27) is later than
    // both `older` and `newer` here, so it sorts before both, not after.
    expect(all.map((c) => c.id)).toEqual([company().id, newer.id, older.id]);
  });
});
