import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
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
      requiresProofOfDelivery: false,
      hasProofOfDelivery: false,
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

  it('round-trips requiresProofOfDelivery, and reflects saveProofOfDelivery via hasProofOfDelivery', async () => {
    const j = job({
      id: makeId<'JobId'>('aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'),
      requiresProofOfDelivery: true,
    });
    await repo().save(j);
    expect((await repo().findById(j.id))?.hasProofOfDelivery).toBe(false);

    await repo().saveProofOfDelivery(j.id, {
      contentType: 'image/jpeg',
      data: Buffer.from('a photo'),
    });
    const withProof = await repo().findById(j.id);
    expect(withProof?.requiresProofOfDelivery).toBe(true);
    expect(withProof?.hasProofOfDelivery).toBe(true);

    // Retaking replaces, rather than appending a second row.
    await repo().saveProofOfDelivery(j.id, {
      contentType: 'image/png',
      data: Buffer.from('a different photo'),
    });
    const { rows } = await sql<{ content_type: string }>`
      select content_type from jobs.proof_of_delivery where job_id = ${j.id}
    `.execute(db);
    expect(rows).toEqual([{ content_type: 'image/png' }]);
  });

  it('finds the job a driver is currently on, and ignores finished ones', async () => {
    const driverId = makeId<'DriverId'>('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
    const done = job({
      id: makeId<'JobId'>('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'),
      status: 'delivered',
      driverId,
    });
    const active = job({
      id: makeId<'JobId'>('cccccccc-1111-4111-8111-cccccccccccc'),
      status: 'en_route',
      driverId,
    });
    await repo().save(done);
    expect(await repo().findActiveForDriver(driverId)).toBeNull();
    await repo().save(active);
    expect((await repo().findActiveForDriver(driverId))?.id).toBe(active.id);
  });

  it('lists only a company’s own jobs, each with its stops', async () => {
    const other = makeId<'CompanyId'>('99999999-0000-4000-8000-999999999999');
    await repo().save(
      job({ id: makeId<'JobId'>('dddddddd-1111-4111-8111-dddddddddddd'), companyId: other }),
    );
    const mine = await repo().listForCompany(companyId);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((j) => j.companyId === companyId)).toBe(true);
    expect(mine.every((j) => j.stops.length === 2)).toBe(true);
  });

  it('writes events to the outbox with the job', async () => {
    const j = job({ id: makeId<'JobId'>('eeeeeeee-1111-4111-8111-eeeeeeeeeeee') });
    await repo().save(j, [
      {
        eventId: 'ffffffff-1111-4111-8111-ffffffffffff',
        aggregateType: 'Job',
        aggregateId: j.id,
        eventType: 'JobCreated',
        payload: { jobId: j.id },
      },
    ]);
    const { rows } = await sql<{ event_type: string }>`
      select event_type from outbox.events where aggregate_id = ${j.id}
    `.execute(db);
    expect(rows).toEqual([{ event_type: 'JobCreated' }]);
  });

  it('refuses, at the database, a second active job for the same driver', async () => {
    const driverId = makeId<'DriverId'>('abababab-1111-4111-8111-abababababab');
    await repo().save(
      job({
        id: makeId<'JobId'>('ab000000-1111-4111-8111-000000000001'),
        status: 'assigned',
        driverId,
      }),
    );
    await expect(
      repo().save(
        job({
          id: makeId<'JobId'>('ab000000-1111-4111-8111-000000000002'),
          status: 'accepted',
          driverId,
        }),
      ),
    ).rejects.toThrow(/jobs_one_active_per_driver_idx/);
  });
});
