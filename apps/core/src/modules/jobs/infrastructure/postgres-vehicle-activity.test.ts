import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job, JobStatus } from '../domain/job.js';
import type { UntypedDb } from './db.js';
import { PostgresJobRepository } from './postgres-job-repository.js';
import { PostgresVehicleJobActivity } from './postgres-vehicle-activity.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const lorry = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000002');
const spare = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000003');

describe('PostgresVehicleJobActivity', () => {
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

  /** A job on a vehicle that left draft at `assignedAt` (or stayed a draft when none), ending in `status`. */
  async function work(
    company: typeof acme,
    vehicleId: typeof lorry | undefined,
    assignedAt: string | undefined,
    status: JobStatus = 'delivered',
  ): Promise<void> {
    n += 1;
    const job: Job = {
      id: makeId<'JobId'>(`aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`),
      companyId: company,
      reference: `JOB-${n}`,
      status: assignedAt === undefined ? 'draft' : status,
      timeline: [
        { status: 'draft', at: new Date('2026-01-01T09:00:00.000Z') },
        ...(assignedAt === undefined
          ? []
          : [{ status: 'assigned' as const, at: new Date(assignedAt) }]),
      ],
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
      currentStop: 0,
      proofStops: [],
      requiresSignature: false,
      signatureStops: [],
      hasSignature: false,
      stops: [{ kind: 'pickup', name: 'Depot', location: { lat: 54.97, lon: -2.1 } }],
      ...(vehicleId === undefined ? {} : { vehicleId }),
    };
    await new PostgresJobRepository(db).save(job);
  }

  const activity = () => new PostgresVehicleJobActivity(db);

  it('gives each vehicle its first day ever, and whether it worked in the range', async () => {
    await work(acme, lorry, '2026-08-12T08:00:00.000Z'); // first ever
    await work(acme, lorry, '2026-10-14T08:00:00.000Z'); // in October
    await work(acme, van, '2026-09-03T08:00:00.000Z'); // worked in September only
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

  it('ignores a draft, a cancelled job, a job with no vehicle, and another company', async () => {
    await work(acme, spare, undefined); // still a draft
    await work(acme, spare, '2026-10-05T08:00:00.000Z', 'cancelled');
    await work(acme, undefined, '2026-10-05T08:00:00.000Z'); // no vehicle on it
    await work(beta, spare, '2026-10-05T08:00:00.000Z'); // someone else's job on the same id
    const rows = await activity().forCompany(acme, '2026-10-01', '2026-11-01');
    expect(rows.map((r) => r.vehicleId)).not.toContain(spare);
    expect(
      (await activity().forCompany(beta, '2026-10-01', '2026-11-01')).map((r) => r.vehicleId),
    ).toEqual([spare]);
  });

  it('counts a failed job as work, and reads the day in UK time, either side of the clocks changing', async () => {
    const lateNight = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000004');
    // 23:30 UTC on 31 October 2026 is 23:30 in London (the clocks went back on the 25th): still October.
    await work(acme, lateNight, '2026-10-31T23:30:00.000Z', 'failed');
    // 23:30 UTC on 30 June is half past midnight on 1 July in London (summer time).
    const summer = makeId<'FleetVehicleId'>('eeeeeeee-0000-4000-8000-000000000005');
    await work(acme, summer, '2026-06-30T23:30:00.000Z');
    const october = await activity().forCompany(acme, '2026-10-01', '2026-11-01');
    expect(october.find((r) => r.vehicleId === lateNight)).toMatchObject({
      firstDay: '2026-10-31',
      activeInRange: true,
    });
    const rows = await activity().forCompany(acme, '2026-07-01', '2026-08-01');
    expect(rows.find((r) => r.vehicleId === summer)).toMatchObject({
      firstDay: '2026-07-01',
      activeInRange: true,
    });
  });
});
