import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { listFleetVehicles } from './list-fleet-vehicles.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';

const companyA = makeId<'CompanyId'>('company-a');
const companyB = makeId<'CompanyId'>('company-b');
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

describe('listFleetVehicles', () => {
  it('returns only the given company’s vehicles', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    await repo.save({
      id: makeId<'FleetVehicleId'>('v1'),
      companyId: companyA,
      name: 'A1',
      dimensions,
    });
    await repo.save({
      id: makeId<'FleetVehicleId'>('v2'),
      companyId: companyB,
      name: 'B1',
      dimensions,
    });

    const result = await listFleetVehicles({ repo }, { companyId: companyA });
    expect(result.map((v) => v.name)).toEqual(['A1']);
  });
});
