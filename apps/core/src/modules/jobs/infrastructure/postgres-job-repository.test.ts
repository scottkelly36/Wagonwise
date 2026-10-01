import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job } from '../domain/job.js';
import type { UntypedDb } from './db.js';
import { PostgresJobRepository } from './postgres-job-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresJobRepository', () => {
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

  const repo = () => new PostgresJobRepository(db);
  const companyId = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');

  function job(overrides: Partial<Job> = {}): Job {
    return {
      id: makeId<'JobId'>('55555555-5555-4555-8555-555555555555'),
      companyId,
      reference: 'JOB-1',
      status: 'draft',
      timeline: [{ status: 'draft', at: new Date('2026-10-01T09:00:00.000Z') }],
      stops: [
        { kind: 'pickup', name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
        {
          kind: 'delivery',
          name: 'Newcastle port',
          location: { lat: 54.97, lon: -1.6 },
          windowFrom: new Date('2026-10-02T08:00:00.000Z'),
          windowTo: new Date('2026-10-02T12:00:00.000Z'),
          notes: 'ring the gate buzzer',
        },
      ],
      ...overrides,
    };
  }

  it('round-trips a job with its stops, reloadable via findById', async () => {
    const j = job();
    await repo().save(j);
    expect(await repo().findById(j.id)).toEqual(j);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'JobId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('round-trips plannedStart, dueBy, driverId and vehicleId when set', async () => {
    const j = job({
      id: makeId<'JobId'>('66666666-6666-4666-8666-666666666666'),
      plannedStart: new Date('2026-10-02T07:00:00.000Z'),
      dueBy: new Date('2026-10-02T18:00:00.000Z'),
      driverId: makeId<'DriverId'>('77777777-7777-4777-8777-777777777777'),
      vehicleId: makeId<'FleetVehicleId'>('88888888-8888-4888-8888-888888888888'),
    });
    await repo().save(j);
    expect(await repo().findById(j.id)).toEqual(j);
  });

  it('replaces stops wholesale on an update', async () => {
    const j = job({ id: makeId<'JobId'>('99999999-9999-4999-8999-999999999999') });
    await repo().save(j);
    const updated: Job = {
      ...j,
      stops: [
        { kind: 'pickup', name: 'A different depot', location: { lat: 55.0, lon: -1.9 } },
        { kind: 'delivery', name: 'A different port', location: { lat: 55.0, lon: -1.5 } },
      ],
    };
    await repo().save(updated);
    expect(await repo().findById(j.id)).toEqual(updated);
  });
});
