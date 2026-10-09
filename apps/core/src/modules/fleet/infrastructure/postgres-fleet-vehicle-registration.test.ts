import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { FleetVehicle } from '../domain/vehicle.js';
import type { UntypedDb } from './db.js';
import { PostgresFleetVehicleRepository } from './postgres-fleet-vehicle-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');

let n = 0;
const vehicle = (over: Partial<FleetVehicle> = {}): FleetVehicle => ({
  id: makeId<'FleetVehicleId'>(`e${String(++n).padStart(7, '0')}-0000-4000-8000-000000000000`),
  companyId: acme,
  name: `Wagon ${n}`,
  dimensions: { heightM: 4, widthM: 2.5, lengthM: 16, grossWeightT: 44 },
  ...over,
});

describe('a vehicle’s registration in Postgres', () => {
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

  it('round-trips a registration, and a vehicle without one', async () => {
    const withPlate = vehicle({ registration: 'AB12CDE' });
    const without = vehicle();
    await repo().save(withPlate);
    await repo().save(without);
    expect(await repo().findById(withPlate.id)).toEqual(withPlate);
    const found = await repo().findById(without.id);
    expect(found?.registration).toBeUndefined();
  });

  it('finds a company’s vehicle by registration, and only that company’s', async () => {
    const v = vehicle({ registration: 'FIND1ME' });
    await repo().save(v);
    expect((await repo().findByRegistration(acme, 'FIND1ME'))?.id).toBe(v.id);
    expect(await repo().findByRegistration(beta, 'FIND1ME')).toBeNull();
    expect(await repo().findByRegistration(acme, 'NOPE')).toBeNull();
  });

  it('refuses the same registration twice in one company, but not across two, and not for several with none', async () => {
    await repo().save(vehicle({ registration: 'DUPE1' }));
    await expect(repo().save(vehicle({ registration: 'DUPE1' }))).rejects.toThrow(
      /vehicles_company_registration_idx/,
    );
    await expect(
      repo().save(vehicle({ registration: 'DUPE1', companyId: beta })),
    ).resolves.toBeUndefined();
    await repo().save(vehicle());
    await repo().save(vehicle());
  });

  it('refuses a registration that is not tidy', async () => {
    await expect(repo().save(vehicle({ registration: 'ab12 cde' }))).rejects.toThrow();
  });

  it('clears a registration when saved without one', async () => {
    const v = vehicle({ registration: 'CLEAR1' });
    await repo().save(v);
    const { registration: _gone, ...bare } = v;
    await repo().save(bare);
    expect((await repo().findById(v.id))?.registration).toBeUndefined();
  });
});
