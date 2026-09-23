import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import type { UntypedDb } from './db.js';
import { PostgresActiveTripRepository } from './postgres-active-trip-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresActiveTripRepository', () => {
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

  const repo = () => new PostgresActiveTripRepository(db);

  function trip(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
    return {
      id: makeId<'ActiveTripId'>('11111111-1111-4111-8111-111111111111'),
      routePlanId: makeId<'RoutePlanId'>('22222222-2222-4222-8222-222222222222'),
      driverId: makeId<'DriverId'>('33333333-3333-4333-8333-333333333333'),
      startedAt: new Date('2026-06-15T08:00:00.000Z'),
      ...overrides,
    };
  }

  it('round-trips a freshly started trip through save/findById', async () => {
    const t = trip();
    await repo().save(t);
    expect(await repo().findById(t.id)).toEqual(t);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'ActiveTripId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('findActiveForDriver finds an unended trip and ignores ended ones', async () => {
    const driverId = makeId<'DriverId'>('44444444-4444-4444-8444-444444444444');
    expect(await repo().findActiveForDriver(driverId)).toBeNull();

    const t = trip({
      id: makeId<'ActiveTripId'>('55555555-5555-4555-8555-555555555555'),
      driverId,
    });
    await repo().save(t);
    expect(await repo().findActiveForDriver(driverId)).toEqual(t);

    const ended = { ...t, endedAt: new Date('2026-06-15T09:00:00.000Z') };
    await repo().save(ended);
    expect(await repo().findActiveForDriver(driverId)).toBeNull();
    expect(await repo().findById(t.id)).toEqual(ended);
  });

  it('rejects a second concurrent active trip for the same driver (unique index)', async () => {
    const driverId = makeId<'DriverId'>('66666666-6666-4666-8666-666666666666');
    await repo().save(
      trip({ id: makeId<'ActiveTripId'>('77777777-7777-4777-8777-777777777777'), driverId }),
    );
    await expect(
      repo().save(
        trip({ id: makeId<'ActiveTripId'>('88888888-8888-4888-8888-888888888888'), driverId }),
      ),
    ).rejects.toThrow();
  });
});
