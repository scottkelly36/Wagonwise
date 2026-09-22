import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { listVehicleProfiles } from './list-vehicle-profiles.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('listVehicleProfiles', () => {
  it('returns only the profiles owned by the given driver', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    await repo.save({
      id: makeId<'VehicleProfileId'>('p1'),
      driverId,
      name: 'Mine A',
      dimensions,
    });
    await repo.save({
      id: makeId<'VehicleProfileId'>('p2'),
      driverId,
      name: 'Mine B',
      dimensions,
    });
    await repo.save({
      id: makeId<'VehicleProfileId'>('p3'),
      driverId: otherDriverId,
      name: 'Someone else’s',
      dimensions,
    });

    const result = await listVehicleProfiles({ repo }, { driverId });
    expect(result.map((p) => p.name).sort()).toEqual(['Mine A', 'Mine B']);
  });

  it('returns an empty list for a driver with no profiles', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    const result = await listVehicleProfiles({ repo }, { driverId });
    expect(result).toEqual([]);
  });
});
