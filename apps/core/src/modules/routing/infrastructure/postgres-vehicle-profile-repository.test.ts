import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { VehicleProfile } from '../domain/vehicle-profile.js';
import type { UntypedDb } from './db.js';
import { PostgresVehicleProfileRepository } from './postgres-vehicle-profile-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresVehicleProfileRepository', () => {
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

  const repo = () => new PostgresVehicleProfileRepository(db);

  function profile(overrides: Partial<VehicleProfile> = {}): VehicleProfile {
    return {
      id: makeId<'VehicleProfileId'>('11111111-1111-4111-8111-111111111111'),
      driverId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      name: 'Big Wagon',
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
      ...overrides,
    };
  }

  it('round-trips a profile through save/findById, including an absent axleWeightT', async () => {
    const p = profile();
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('round-trips a profile with axleWeightT present', async () => {
    const p = profile({
      id: makeId<'VehicleProfileId'>('33333333-3333-4333-8333-333333333333'),
      dimensions: { heightM: 4.0, widthM: 2.5, lengthM: 12, grossWeightT: 26, axleWeightT: 10 },
    });
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(makeId<'VehicleProfileId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('an update (save with the same id) overwrites the row rather than inserting a new one', async () => {
    const p = profile({ id: makeId<'VehicleProfileId'>('44444444-4444-4444-8444-444444444444') });
    await repo().save(p);
    const updated: VehicleProfile = {
      ...p,
      name: 'Renamed',
      dimensions: { ...p.dimensions, heightM: 3.9 },
    };
    await repo().save(updated);

    expect(await repo().findById(p.id)).toEqual(updated);
    expect((await repo().listForDriver(p.driverId)).filter((x) => x.id === p.id)).toHaveLength(1);
  });

  it('listForDriver returns only that driver’s profiles, ordered by name', async () => {
    const driverId = makeId<'DriverId'>('55555555-5555-4555-8555-555555555555');
    const otherDriverId = makeId<'DriverId'>('66666666-6666-4666-8666-666666666666');
    await repo().save(
      profile({
        id: makeId<'VehicleProfileId'>('77777777-7777-4777-8777-777777777777'),
        driverId,
        name: 'Z Wagon',
      }),
    );
    await repo().save(
      profile({
        id: makeId<'VehicleProfileId'>('88888888-8888-4888-8888-888888888888'),
        driverId,
        name: 'A Wagon',
      }),
    );
    await repo().save(
      profile({
        id: makeId<'VehicleProfileId'>('99999999-9999-4999-8999-999999999999'),
        driverId: otherDriverId,
        name: 'Someone Else',
      }),
    );

    const result = await repo().listForDriver(driverId);
    expect(result.map((p) => p.name)).toEqual(['A Wagon', 'Z Wagon']);
  });

  it('listForDriver returns an empty array for a driver with no profiles', async () => {
    expect(
      await repo().listForDriver(makeId<'DriverId'>('00000000-0000-4000-8000-000000000001')),
    ).toEqual([]);
  });

  it('delete removes the row', async () => {
    const p = profile({
      id: makeId<'VehicleProfileId'>('10101010-1010-4101-8101-101010101010'),
      driverId: makeId<'DriverId'>('20202020-2020-4202-8202-202020202020'),
    });
    await repo().save(p);
    await repo().delete(p.id);
    expect(await repo().findById(p.id)).toBeNull();
  });

  it('delete on an already-absent id is a no-op, not an error', async () => {
    await expect(
      repo().delete(makeId<'VehicleProfileId'>('30303030-3030-4303-8303-303030303030')),
    ).resolves.toBeUndefined();
  });
});
