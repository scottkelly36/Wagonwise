import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Check } from '../domain/check.js';
import type { UntypedDb } from './db.js';
import { PostgresCheckRepository } from './postgres-check-repository.js';
import { PostgresOfficeCheckRepository } from './postgres-office-check-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const lorry = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000001');
const staff = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
// A check with nothing wrong goes before the first date; one that found a defect only before the second, which is earlier (it is kept longer).
const CUTOFFS = {
  clearBefore: new Date('2026-01-01T00:00:00.000Z'),
  withDefectsBefore: new Date('2025-10-01T00:00:00.000Z'),
};

let n = 0;
const uuid = (prefix: string): string =>
  `${prefix}${String(++n).padStart(7, '0')}-0000-4000-8000-000000000000`;

function check(
  over: Partial<Check> = {},
  withDefect = false,
): { check: Check; defectIds: string[] } {
  const made: Check = {
    id: makeId<'CheckId'>(uuid('c')),
    companyId: acme,
    templateId: makeId<'CheckTemplateId'>('a0000000-0000-4000-8000-000000000001'),
    templateVersion: 1,
    templateName: 'Tractor unit',
    vehicleId: lorry,
    vehicleName: 'Big Wagon',
    driverId: makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001'),
    checkDay: '2025-06-01',
    items: [],
    answers: [],
    result: withDefect ? 'do_not_drive' : 'clear',
    defects: withDefect
      ? [
          {
            itemId: 'tyres',
            label: 'Tyres',
            severity: 'do_not_drive',
            detail: 'Flagged as a defect',
            note: undefined,
          },
        ]
      : [],
    submittedAt: new Date('2025-06-01T08:00:00.000Z'),
    deviceCompletedAt: undefined,
    ...over,
  };
  return { check: made, defectIds: made.defects.map(() => uuid('d')) };
}

describe('PostgresCheckRepository.deleteOlderThan', () => {
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

  const repo = () => new PostgresCheckRepository(db);
  const exists = async (id: string) =>
    (await pool.query('select 1 from checks.checks where id = $1', [id])).rowCount === 1;
  const rowsIn = async (table: string, id: string) =>
    (await pool.query(`select 1 from checks.${table} where check_id = $1`, [id])).rowCount;

  it('deletes an old check with its photos, and keeps a recent one', async () => {
    const old = check();
    const recent = check({
      submittedAt: new Date('2026-06-01T08:00:00.000Z'),
      checkDay: '2026-06-01',
    });
    for (const c of [old, recent]) await repo().save(c.check, c.defectIds);
    await pool.query(
      `insert into checks.check_photos (check_id, item_id, company_id, content_type, data, captured_at)
       values ($1, 'load', $2, 'image/jpeg', 'x', now())`,
      [old.check.id, acme],
    );

    const removed = await repo().deleteOlderThan(acme, CUTOFFS);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await exists(old.check.id)).toBe(false);
    expect(await rowsIn('check_photos', old.check.id)).toBe(0);
    expect(await exists(recent.check.id)).toBe(true);
  });

  it('keeps an old check whose defect is still open or only seen, until the office marks it fixed', async () => {
    const withDefect = check({}, true);
    const defectId = withDefect.defectIds[0] as string;
    await repo().save(withDefect.check, withDefect.defectIds);
    const office = new PostgresOfficeCheckRepository(db);

    await repo().deleteOlderThan(acme, CUTOFFS);
    expect(await exists(withDefect.check.id)).toBe(true);

    await office.setDefectStatus(defectId, 'acknowledged', staff, new Date());
    await repo().deleteOlderThan(acme, CUTOFFS);
    expect(await exists(withDefect.check.id)).toBe(true);

    await office.setDefectStatus(defectId, 'fixed', staff, new Date());
    await repo().deleteOlderThan(acme, CUTOFFS);
    expect(await exists(withDefect.check.id)).toBe(false);
    expect(await rowsIn('defects', withDefect.check.id)).toBe(0);
  });

  it('keeps a check that found a defect longer than one that found nothing: the legal minimum for defect reports', async () => {
    const office = new PostgresOfficeCheckRepository(db);
    // Both submitted in November 2025: after the defect date (October), before the clear date (January).
    const between = { submittedAt: new Date('2025-11-15T08:00:00.000Z'), checkDay: '2025-11-15' };
    const clear = check(between);
    const fixedDefect = check(between, true);
    // And one that found a defect, fixed, from before even the defect date.
    const tooOld = check(
      { submittedAt: new Date('2025-08-01T08:00:00.000Z'), checkDay: '2025-08-01' },
      true,
    );
    for (const c of [clear, fixedDefect, tooOld]) await repo().save(c.check, c.defectIds);
    await office.setDefectStatus(fixedDefect.defectIds[0] as string, 'fixed', staff, new Date());
    await office.setDefectStatus(tooOld.defectIds[0] as string, 'fixed', staff, new Date());

    await repo().deleteOlderThan(acme, CUTOFFS);
    expect(await exists(clear.check.id)).toBe(false);
    expect(await exists(fixedDefect.check.id)).toBe(true);
    expect(await rowsIn('defects', fixedDefect.check.id)).toBe(1);
    expect(await exists(tooOld.check.id)).toBe(false);
  });

  it('only touches the company it was asked about', async () => {
    const theirs = check({ companyId: beta });
    await repo().save(theirs.check, theirs.defectIds);
    await repo().deleteOlderThan(acme, CUTOFFS);
    expect(await exists(theirs.check.id)).toBe(true);
    await repo().deleteOlderThan(beta, CUTOFFS);
    expect(await exists(theirs.check.id)).toBe(false);
  });
});
