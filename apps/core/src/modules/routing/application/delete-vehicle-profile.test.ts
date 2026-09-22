import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { deleteVehicleProfile, type DeleteVehicleProfileDeps } from './delete-vehicle-profile.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

async function seeded(): Promise<DeleteVehicleProfileDeps> {
  const repo = new InMemoryVehicleProfileRepository();
  await repo.save({ id: profileId, driverId, name: 'Wagon', dimensions });
  return { repo };
}

describe('deleteVehicleProfile', () => {
  it('deletes an existing profile owned by the caller', async () => {
    const deps = await seeded();
    const result = await deleteVehicleProfile(deps, { id: profileId, driverId });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await deps.repo.findById(profileId)).toBeNull();
  });

  it('returns VehicleProfileNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await deleteVehicleProfile(deps, {
      id: makeId<'VehicleProfileId'>('nope'),
      driverId,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
  });

  it('returns VehicleProfileNotFound and leaves the profile alone when the driverId does not match', async () => {
    const deps = await seeded();
    const result = await deleteVehicleProfile(deps, { id: profileId, driverId: otherDriverId });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
    expect(await deps.repo.findById(profileId)).not.toBeNull();
  });
});
