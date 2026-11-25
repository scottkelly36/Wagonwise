import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Check } from '../domain/check.js';
import type { UntypedDb } from './db.js';
import { PostgresCheckRepository } from './postgres-check-repository.js';
import { PostgresVehicleCheckActivity } from './postgres-vehicle-activity.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const lorry = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000002');

describe('PostgresVehicleCheckActivity', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;
  let n = 0;

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

  async function checked(company: typeof acme, vehicleId: typeof lorry, day: string) {
    n += 1;
    const check: Check = {
      id: makeId<'CheckId'>(`c${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`),
      companyId: company,
      templateId: makeId<'CheckTemplateId'>('a0000000-0000-4000-8000-000000000001'),
      templateVersion: 1,
      templateName: 'Tractor unit',
      vehicleId,
      vehicleName: 'Big Wagon',
      driverId: makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001'),
      checkDay: day,
      items: [],
      answers: [],
      result: 'clear',
      defects: [],
      submittedAt: new Date(`${day}T08:00:00.000Z`),
      deviceCompletedAt: undefined,
    };
    await new PostgresCheckRepository(db).save(check, []);
  }

  const activity = () => new PostgresVehicleCheckActivity(db);

  it('gives each vehicle its first check day, and whether it was checked in the range', async () => {
    await checked(acme, lorry, '2026-08-12');
    await checked(acme, lorry, '2026-10-14');
    await checked(acme, van, '2026-09-03');
    const rows = await activity().forCompany(acme, '2026-10-01', '2026-11-01');
    const byVehicle = new Map(rows.map((r) => [r.vehicleId, r]));
    expect(byVehicle.get(lorry)).toEqual({
      vehicleId: lorry,
      firstDay: '2026-08-12',
      activeInRange: true,
    });
    expect(byVehicle.get(van)).toEqual({
      vehicleId: van,
      firstDay: '2026-09-03',
      activeInRange: false,
    });
  });

  it('counts the first day of the month, not the first day of the next, and leaves other companies out', async () => {
    const edge = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000009');
    await checked(acme, edge, '2026-11-01');
    await checked(beta, lorry, '2026-10-05');
    const october = await activity().forCompany(acme, '2026-10-01', '2026-11-01');
    expect(october.find((r) => r.vehicleId === edge)?.activeInRange).toBe(false);
    const november = await activity().forCompany(acme, '2026-11-01', '2026-12-01');
    expect(november.find((r) => r.vehicleId === edge)?.activeInRange).toBe(true);
    expect(await activity().forCompany(beta, '2026-10-01', '2026-11-01')).toEqual([
      { vehicleId: lorry, firstDay: '2026-10-05', activeInRange: true },
    ]);
  });
});
