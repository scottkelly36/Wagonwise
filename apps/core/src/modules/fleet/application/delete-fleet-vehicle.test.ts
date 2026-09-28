import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { deleteFleetVehicle } from './delete-fleet-vehicle.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';

const companyId = makeId<'CompanyId'>('company-1');
const vehicleId = makeId<'FleetVehicleId'>('vehicle-1');
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('deleteFleetVehicle', () => {
  it('deletes an existing vehicle', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    await repo.save({ id: vehicleId, companyId, name: 'Big Wagon', dimensions });

    const result = await deleteFleetVehicle({ repo }, { id: vehicleId });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.findById(vehicleId)).toBeNull();
  });

  it('returns FleetVehicleNotFound for an unknown id', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const result = await deleteFleetVehicle({ repo }, { id: makeId<'FleetVehicleId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'FleetVehicleNotFound' } });
  });
});
