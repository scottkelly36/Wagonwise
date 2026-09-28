import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Dimensions, FleetVehicle } from '../domain/vehicle.js';
import { updateFleetVehicle, type UpdateFleetVehicleDeps } from './update-fleet-vehicle.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';

const companyId = makeId<'CompanyId'>('company-1');
const vehicleId = makeId<'FleetVehicleId'>('vehicle-1');

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

async function seeded(overrides: Partial<FleetVehicle> = {}): Promise<UpdateFleetVehicleDeps> {
  const repo = new InMemoryFleetVehicleRepository();
  await repo.save({
    id: vehicleId,
    companyId,
    name: 'Original Name',
    dimensions: dimensions(),
    ...overrides,
  });
  return { repo };
}

describe('updateFleetVehicle', () => {
  it('updates the name and dimensions', async () => {
    const deps = await seeded();
    const result = await updateFleetVehicle(deps, {
      id: vehicleId,
      name: 'New Name',
      dimensions: dimensions({ heightM: 3.9 }),
    });
    expect(result).toEqual({
      ok: true,
      value: { id: vehicleId, companyId, name: 'New Name', dimensions: dimensions({ heightM: 3.9 }) },
    });
  });

  it('returns FleetVehicleNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await updateFleetVehicle(deps, {
      id: makeId<'FleetVehicleId'>('nope'),
      name: 'New Name',
      dimensions: dimensions(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'FleetVehicleNotFound' } });
  });

  it('rejects invalid dimensions without persisting the change', async () => {
    const deps = await seeded();
    const result = await updateFleetVehicle(deps, {
      id: vehicleId,
      name: 'New Name',
      dimensions: dimensions({ widthM: -1 }),
    });
    expect(result.ok).toBe(false);
    expect((await deps.repo.findById(vehicleId))?.name).toBe('Original Name');
  });
});
