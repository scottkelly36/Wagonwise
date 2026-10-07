import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job } from '../domain/job.js';
import type { UntypedDb } from './db.js';
import { PostgresJobPositionRepository } from './postgres-job-position-repository.js';
import { PostgresJobRepository } from './postgres-job-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresJobPositionRepository', () => {
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

  const companyA = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
  const companyB = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
  const jobId = (n: number) => makeId<'JobId'>(`aaaaaaaa-0000-4000-8000-00000000000${n}`);

  function job(n: number, companyId: typeof companyA, status: Job['status']): Job {
    return {
      id: jobId(n),
      companyId,
      reference: `JOB-${n}`,
      status,
      timeline: [{ status: 'draft', at: new Date('2026-10-01T09:00:00.000Z') }],
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
      stops: [
        { kind: 'pickup', name: 'A', location: { lat: 54.97, lon: -2.1 } },
        { kind: 'delivery', name: 'B', location: { lat: 54.97, lon: -1.6 } },
      ],
    };
  }

  it('returns the newest position per job, only for the company’s jobs being driven', async () => {
    const jobs = new PostgresJobRepository(db);
    const positions = new PostgresJobPositionRepository(db);
    await jobs.save(job(1, companyA, 'en_route'));
    await jobs.save(job(2, companyA, 'assigned'));
    await jobs.save(job(3, companyA, 'delivered'));
    await jobs.save(job(4, companyB, 'en_route'));

    const at = (minute: number) => new Date(Date.UTC(2026, 9, 3, 10, minute));
    await positions.record({
      jobId: jobId(1),
      location: { lat: 54.9, lon: -2.1 },
      recordedAt: at(0),
    });
    await positions.record({
      jobId: jobId(1),
      location: { lat: 54.95, lon: -2.05 },
      recordedAt: at(1),
    });
    await positions.record({ jobId: jobId(2), location: { lat: 1, lon: 1 }, recordedAt: at(1) });
    await positions.record({ jobId: jobId(3), location: { lat: 2, lon: 2 }, recordedAt: at(1) });
    await positions.record({ jobId: jobId(4), location: { lat: 3, lon: 3 }, recordedAt: at(1) });

    const latest = await positions.latestForCompany(companyA);

    expect(latest).toHaveLength(1);
    expect(latest[0]?.jobId).toBe(jobId(1));
    expect(latest[0]?.location.lat).toBeCloseTo(54.95, 5);
    expect(latest[0]?.location.lon).toBeCloseTo(-2.05, 5);
    expect(latest[0]?.recordedAt).toEqual(at(1));
  });

  it('ignores a repeat of the same instant rather than failing', async () => {
    const positions = new PostgresJobPositionRepository(db);
    const report = {
      jobId: jobId(1),
      location: { lat: 54.95, lon: -2.05 },
      recordedAt: new Date(Date.UTC(2026, 9, 3, 10, 1)),
    };
    await expect(positions.record(report)).resolves.toBeUndefined();
  });

  it('deletes positions recorded before the cutoff, for any job, and keeps the rest', async () => {
    const jobs = new PostgresJobRepository(db);
    const positions = new PostgresJobPositionRepository(db);
    await jobs.save(job(5, companyA, 'en_route'));
    const old = (day: number) => new Date(Date.UTC(2025, 0, day, 9, 0));
    await positions.record({
      jobId: jobId(5),
      location: { lat: 54.9, lon: -2.1 },
      recordedAt: old(1),
    });
    await positions.record({
      jobId: jobId(5),
      location: { lat: 54.9, lon: -2.1 },
      recordedAt: old(2),
    });
    const recent = new Date(Date.UTC(2026, 9, 6, 9, 0));
    await positions.record({
      jobId: jobId(5),
      location: { lat: 54.91, lon: -2.1 },
      recordedAt: recent,
    });

    const removed = await positions.deleteOlderThan(new Date(Date.UTC(2026, 0, 1)));

    expect(removed).toBe(2);
    const latest = await positions.latestForCompany(companyA);
    expect(latest.find((p) => p.jobId === jobId(5))?.recordedAt).toEqual(recent);
    expect(await positions.deleteOlderThan(new Date(Date.UTC(2026, 0, 1)))).toBe(0);
  });
});
