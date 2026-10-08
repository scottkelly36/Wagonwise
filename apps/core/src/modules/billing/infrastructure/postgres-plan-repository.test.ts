import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { UntypedDb } from './db.js';
import { PostgresBillingDetailsRepository } from './postgres-billing-details-repository.js';
import { PostgresPlanRepository } from './postgres-plan-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const admin = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const at = new Date('2026-10-09T09:00:00.000Z');

describe('Postgres billing repositories', () => {
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

  // The test connection is the database owner, which Row-Level Security does not apply to; the policies
  // themselves are covered in composition/row-level-security.test.ts.
  it('seeds the billing details with placeholders, and saves new ones', async () => {
    const repo = new PostgresBillingDetailsRepository(db);
    expect((await repo.get()).details.tradingName).toBe('[Trading name]');
    const details = {
      tradingName: 'WagonWise Ltd',
      address: '1 High Street',
      contactEmail: 'billing@example.com',
      paymentDetails: 'Sort code 00-00-00',
      vatStatus: 'Not VAT registered',
      paymentTerms: '14 days',
    };
    await repo.save(details, admin, at);
    expect(await repo.get()).toEqual({ details, updatedAt: at });
  });

  it('round-trips a price, and replaces it', async () => {
    const repo = new PostgresPlanRepository(db);
    expect((await repo.listPrices()).size).toBe(0);
    await repo.setPrice(acme, 1500, admin, at);
    await repo.setPrice(acme, 1200, admin, at);
    expect((await repo.listPrices()).get(acme)).toBe(1200);
  });

  it('keeps one capacity per company per day, reads dates back as plain days, and separates companies', async () => {
    const repo = new PostgresPlanRepository(db);
    await repo.setCapacity(
      { companyId: acme, effectiveFrom: '2026-11-01', capacity: 5 },
      admin,
      at,
    );
    await repo.setCapacity(
      { companyId: acme, effectiveFrom: '2026-11-01', capacity: 6 },
      admin,
      at,
    );
    await repo.setCapacity(
      { companyId: acme, effectiveFrom: '2026-12-01', capacity: 8 },
      admin,
      at,
    );
    await repo.setCapacity(
      { companyId: beta, effectiveFrom: '2026-11-01', capacity: 2 },
      admin,
      at,
    );
    expect(await repo.listChanges(acme)).toEqual([
      { companyId: acme, effectiveFrom: '2026-11-01', capacity: 6 },
      { companyId: acme, effectiveFrom: '2026-12-01', capacity: 8 },
    ]);
    expect(await repo.listAllChanges()).toHaveLength(3);
  });
});
