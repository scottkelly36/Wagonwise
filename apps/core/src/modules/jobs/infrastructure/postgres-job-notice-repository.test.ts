import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job } from '../domain/job.js';
import type { UntypedDb } from './db.js';
import { PostgresJobNoticeRepository } from './postgres-job-notice-repository.js';
import { PostgresJobRepository } from './postgres-job-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresJobNoticeRepository', () => {
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

  const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
  const driverId = makeId<'DriverId'>('77777777-7777-4777-8777-777777777777');
  const vehicleId = makeId<'FleetVehicleId'>('88888888-8888-4888-8888-888888888888');
  const job = (id: string, status: Job['status'], withDriver = true, other = false): Job => ({
    id: makeId<'JobId'>(id),
    companyId: acme,
    reference: `REF-${id.slice(0, 4)}`,
    status,
    timeline: [{ status: 'draft', at: new Date('2026-10-09T08:00:00.000Z') }],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    currentStop: 0,
    proofStops: [],
    stops: [{ kind: 'delivery', name: 'Port', location: { lat: 54.97, lon: -1.6 } }],
    ...(withDriver
      ? {
          driverId: other ? makeId<'DriverId'>('77777777-7777-4777-8777-777777777778') : driverId,
          vehicleId: other
            ? makeId<'FleetVehicleId'>('88888888-8888-4888-8888-888888888889')
            : vehicleId,
        }
      : {}),
  });
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'aaaaaaaa-0000-4000-8000-000000000002';
  const C = 'aaaaaaaa-0000-4000-8000-000000000003';

  it('records attempts, lists only jobs assigned and waiting, and notes the first sight only', async () => {
    const jobs = new PostgresJobRepository(db);
    const notices = new PostgresJobNoticeRepository(db);
    await jobs.save(job(A, 'assigned'));
    await jobs.save(job(B, 'accepted', true, true));
    await jobs.save(job(C, 'draft', false));

    expect(await notices.find(makeId<'JobId'>(C))).toBeNull();
    const fresh = await notices.find(makeId<'JobId'>(A));
    expect(fresh).toMatchObject({ result: null, devices: 0, attempts: 0, seenAt: null });

    await notices.record(makeId<'JobId'>(A), 'no_device', 0, new Date('2026-10-09T09:00:00.000Z'));
    await notices.record(makeId<'JobId'>(A), 'sent', 2, new Date('2026-10-09T09:05:00.000Z'));
    expect(await notices.find(makeId<'JobId'>(A))).toMatchObject({
      result: 'sent',
      devices: 2,
      attempts: 2,
      lastAttemptAt: new Date('2026-10-09T09:05:00.000Z'),
    });

    const waiting = await notices.listWaiting(acme);
    expect(waiting.map((n) => n.jobId)).toEqual([A]);

    await notices.markSeen(makeId<'JobId'>(A), new Date('2026-10-09T10:00:00.000Z'));
    await notices.markSeen(makeId<'JobId'>(A), new Date('2026-10-09T11:00:00.000Z'));
    expect((await notices.find(makeId<'JobId'>(A)))?.seenAt).toEqual(
      new Date('2026-10-09T10:00:00.000Z'),
    );
  });
});
