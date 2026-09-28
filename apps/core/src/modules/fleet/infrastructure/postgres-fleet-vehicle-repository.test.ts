import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { FleetVehicle } from '../domain/vehicle.js';
import type { UntypedDb } from './db.js';
import { PostgresFleetVehicleRepository } from './postgres-fleet-vehicle-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresFleetVehicleRepository', () => {
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

  const repo = () => new PostgresFleetVehicleRepository(db);
  const companyId = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');

  function vehicle(overrides: Partial<FleetVehicle> = {}): FleetVehicle {
    return {
      id: makeId<'FleetVehicleId'>('55555555-5555-4555-8555-555555555555'),
      companyId,
      name: 'Big Wagon',
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
      ...overrides,
    };
  }

  it('round-trips a vehicle, reloadable via findById', async () => {
    const v = vehicle();
    await repo().save(v);
    expect(await repo().findById(v.id)).toEqual(v);
  });

  it('round-trips a vehicle with an axle weight', async () => {
    const v = vehicle({
      id: makeId<'FleetVehicleId'>('66666666-6666-4666-8666-666666666666'),
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, axleWeightT: 10 },
    });
    await repo().save(v);
    expect(await repo().findById(v.id)).toEqual(v);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await repo().findById(
        makeId<'FleetVehicleId'>('00000000-0000-4000-8000-000000000000'),
      ),
    ).toBeNull();
  });

  it('lists only a company’s own vehicles', async () => {
    const otherCompany = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
    const mine = vehicle({
      id: makeId<'FleetVehicleId'>('77777777-7777-4777-8777-777777777777'),
      name: 'Mine',
    });
    const theirs = vehicle({
      id: makeId<'FleetVehicleId'>('88888888-8888-4888-8888-888888888888'),
      companyId: otherCompany,
      name: 'Theirs',
    });
    await repo().save(mine);
    await repo().save(theirs);

    const found = await repo().listForCompany(companyId);
    expect(found.map((v) => v.name)).toContain('Mine');
    expect(found.map((v) => v.name)).not.toContain('Theirs');
  });

  it('updates an existing vehicle on conflict', async () => {
    const v = vehicle({ id: makeId<'FleetVehicleId'>('99999999-9999-4999-8999-999999999999') });
    await repo().save(v);
    await repo().save({ ...v, name: 'Renamed' });

    expect((await repo().findById(v.id))?.name).toBe('Renamed');
  });

  it('deletes a vehicle', async () => {
    const v = vehicle({ id: makeId<'FleetVehicleId'>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') });
    await repo().save(v);
    await repo().delete(v.id);
    expect(await repo().findById(v.id)).toBeNull();
  });
});
