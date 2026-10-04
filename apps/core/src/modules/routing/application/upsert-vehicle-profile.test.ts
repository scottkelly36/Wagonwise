import { describe, expect, it } from 'vitest';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { upsertVehicleProfile } from './upsert-vehicle-profile.js';

const ID = '11111111-1111-4111-8111-111111111111';
const DRIVER = '22222222-2222-4222-8222-222222222222';
const DIMENSIONS = { heightM: 4, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 };

describe('upsertVehicleProfile', () => {
  it('creates a profile from the vehicle’s measurements under the id it was given', async () => {
    const repo = new InMemoryVehicleProfileRepository();

    const result = await upsertVehicleProfile(
      { repo },
      { id: ID, driverId: DRIVER, name: 'Scania R450', dimensions: DIMENSIONS },
    );

    expect(result.ok).toBe(true);
    const stored = await repo.findById(ID as never);
    expect(stored).toMatchObject({ name: 'Scania R450', dimensions: DIMENSIONS });
  });

  it('writes over the old measurements, so a corrected vehicle applies from the next start', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    await upsertVehicleProfile(
      { repo },
      { id: ID, driverId: DRIVER, name: 'Scania', dimensions: DIMENSIONS },
    );

    await upsertVehicleProfile(
      { repo },
      { id: ID, driverId: DRIVER, name: 'Scania', dimensions: { ...DIMENSIONS, heightM: 4.2 } },
    );

    expect((await repo.listForDriver(DRIVER as never)).length).toBe(1);
    expect((await repo.findById(ID as never))?.dimensions.heightM).toBe(4.2);
  });

  it('refuses measurements that are not real, and stores nothing', async () => {
    const repo = new InMemoryVehicleProfileRepository();

    const result = await upsertVehicleProfile(
      { repo },
      { id: ID, driverId: DRIVER, name: 'Scania', dimensions: { ...DIMENSIONS, heightM: 0 } },
    );

    expect(result).toMatchObject({ ok: false, error: { tag: 'InvalidDimensions' } });
    expect(await repo.findById(ID as never)).toBeNull();
  });

  it('refuses a blank name', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    const result = await upsertVehicleProfile(
      { repo },
      { id: ID, driverId: DRIVER, name: '  ', dimensions: DIMENSIONS },
    );
    expect(result).toMatchObject({ ok: false, error: { tag: 'InvalidName' } });
  });
});
