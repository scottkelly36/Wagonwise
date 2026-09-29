import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { deleteFleetVehicle } from './delete-fleet-vehicle.js';
import type { Caller } from './ports/caller-directory.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';

const companyId = makeId<'CompanyId'>('company-1');
const vehicleId = makeId<'FleetVehicleId'>('vehicle-1');
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const ADMIN: Caller = { kind: 'platform' };

describe('deleteFleetVehicle', () => {
  it('deletes an existing vehicle', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    await repo.save({ id: vehicleId, companyId, name: 'Big Wagon', dimensions });

    const result = await deleteFleetVehicle({ repo }, { caller: ADMIN, id: vehicleId });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.findById(vehicleId)).toBeNull();
  });

  it('returns FleetVehicleNotFound for an unknown id', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const result = await deleteFleetVehicle(
      { repo },
      { caller: ADMIN, id: makeId<'FleetVehicleId'>('nope') },
    );
    expect(result).toEqual({ ok: false, error: { tag: 'FleetVehicleNotFound' } });
  });

  it("answers another company's vehicle as not found, and a viewer's delete as forbidden", async () => {
    const repo = new InMemoryFleetVehicleRepository();
    await repo.save({ id: vehicleId, companyId, name: 'Big Wagon', dimensions });
    const outsider: Caller = {
      kind: 'fleet',
      companyId: makeId<'CompanyId'>('company-2'),
      privileges: ['manage_fleet'],
    };
    const viewer: Caller = { kind: 'fleet', companyId, privileges: [] };

    expect(await deleteFleetVehicle({ repo }, { caller: outsider, id: vehicleId })).toEqual({
      ok: false,
      error: { tag: 'FleetVehicleNotFound' },
    });
    expect(await deleteFleetVehicle({ repo }, { caller: viewer, id: vehicleId })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await repo.findById(vehicleId)).not.toBeNull();
  });
});
