import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { getVehicleProfile, type GetVehicleProfileDeps } from './get-vehicle-profile.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

async function seeded(): Promise<GetVehicleProfileDeps> {
  const repo = new InMemoryVehicleProfileRepository();
  await repo.save({ id: profileId, driverId, name: 'Wagon', dimensions });
  return { repo };
}

describe('getVehicleProfile', () => {
  it('returns the profile when it exists and is owned by the caller', async () => {
    const deps = await seeded();
    const result = await getVehicleProfile(deps, { id: profileId, driverId });
    expect(result).toEqual({
      ok: true,
      value: { id: profileId, driverId, name: 'Wagon', dimensions },
    });
  });

  it('returns VehicleProfileNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await getVehicleProfile(deps, {
      id: makeId<'VehicleProfileId'>('nope'),
      driverId,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
  });

  it('returns VehicleProfileNotFound when the driverId does not match, not the profile', async () => {
    const deps = await seeded();
    const result = await getVehicleProfile(deps, { id: profileId, driverId: otherDriverId });
    expect(result).toEqual({ ok: false, error: { tag: 'VehicleProfileNotFound' } });
  });
});
