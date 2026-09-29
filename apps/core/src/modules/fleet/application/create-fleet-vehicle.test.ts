import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Dimensions } from '../domain/vehicle.js';
import { createFleetVehicle, type CreateFleetVehicleDeps } from './create-fleet-vehicle.js';
import type { Caller } from './ports/caller-directory.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';

const companyId = makeId<'CompanyId'>('company-1');
const ADMIN: Caller = { kind: 'platform' };

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

function buildDeps(repo: InMemoryFleetVehicleRepository): CreateFleetVehicleDeps {
  return { repo, ids: new SequentialIdGenerator() };
}

describe('createFleetVehicle', () => {
  it('creates and persists a vehicle with a generated id', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const result = await createFleetVehicle(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      name: '  Big Wagon  ',
      dimensions: dimensions(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      companyId,
      name: 'Big Wagon',
      dimensions: dimensions(),
    });

    const stored = await repo.findById(result.value.id);
    expect(stored).toEqual(result.value);
  });

  it('rejects a blank name without touching the repository', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const result = await createFleetVehicle(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      name: '   ',
      dimensions: dimensions(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidName' } });
    expect(await repo.listForCompany(companyId)).toEqual([]);
  });

  it('rejects invalid dimensions without touching the repository', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const result = await createFleetVehicle(buildDeps(repo), {
      caller: ADMIN,
      companyId,
      name: 'Big Wagon',
      dimensions: dimensions({ heightM: 0 }),
    });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidDimensions', reason: 'must_be_positive' },
    });
    expect(await repo.listForCompany(companyId)).toEqual([]);
  });

  it('lets a manage_fleet member add to their own company, and refuses anyone else', async () => {
    const repo = new InMemoryFleetVehicleRepository();
    const input = { companyId, name: 'Big Wagon', dimensions: dimensions() };
    const member: Caller = { kind: 'fleet', companyId, privileges: ['manage_fleet'] };
    const viewer: Caller = { kind: 'fleet', companyId, privileges: [] };
    const outsider: Caller = {
      kind: 'fleet',
      companyId: makeId<'CompanyId'>('company-2'),
      privileges: ['manage_fleet'],
    };

    expect((await createFleetVehicle(buildDeps(repo), { ...input, caller: member })).ok).toBe(true);
    for (const caller of [viewer, outsider]) {
      expect(await createFleetVehicle(buildDeps(repo), { ...input, caller })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect(await repo.listForCompany(companyId)).toHaveLength(1);
  });
});
