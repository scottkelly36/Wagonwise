import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions, VehicleProfile } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { updateVehicleProfile, type UpdateVehicleProfileDeps } from './update-vehicle-profile.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const profileId = makeId<'VehicleProfileId'>('profile-1');

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

async function seeded(profile: Partial<VehicleProfile> = {}): Promise<UpdateVehicleProfileDeps> {
  const repo = new InMemoryVehicleProfileRepository();
  await repo.save({
    id: profileId,
    driverId,
    name: 'Original Name',
    dimensions: dimensions(),
    ...profile,
  });
  return { repo };
}

describe('updateVehicleProfile', () => {
  it('updates the name and dimensions of an existing profile', async () => {
    const deps = await seeded();
    const result = await updateVehicleProfile(deps, {
      id: profileId,
      driverId,
      name: 'New Name',
      dimensions: dimensions({ heightM: 3.9 }),
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: profileId,
        driverId,
        name: 'New Name',
        dimensions: dimensions({ heightM: 3.9 }),
      },
    });
    expect(await deps.repo.findById(profileId)).toEqual(result.ok ? result.value : undefined);
  });

  it('returns VehicleProfileNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await updateVehicleProfile(deps, {
      id: makeId<'VehicleProfileId'>('nope'),
      driverId,
      name: 'New Name',
      dimensions: dimensions(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
  });

  it('returns VehicleProfileNotFound (not a different error) when the driverId does not match', async () => {
    const deps = await seeded();
    const result = await updateVehicleProfile(deps, {
      id: profileId,
      driverId: otherDriverId,
      name: 'New Name',
      dimensions: dimensions(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
    // untouched
    expect((await deps.repo.findById(profileId))?.name).toBe('Original Name');
  });

  it('rejects invalid dimensions without persisting the change', async () => {
    const deps = await seeded();
    const result = await updateVehicleProfile(deps, {
      id: profileId,
      driverId,
      name: 'New Name',
      dimensions: dimensions({ widthM: -1 }),
    });
    expect(result.ok).toBe(false);
    expect((await deps.repo.findById(profileId))?.name).toBe('Original Name');
  });
});
