import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import { createVehicleProfile, type CreateVehicleProfileDeps } from './create-vehicle-profile.js';

const driverId = makeId<'DriverId'>('driver-1');

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

function buildDeps(overrides: Partial<CreateVehicleProfileDeps> = {}): CreateVehicleProfileDeps {
  return {
    repo: new InMemoryVehicleProfileRepository(),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
}

describe('createVehicleProfile', () => {
  it('creates and persists a profile with a generated id', async () => {
    const deps = buildDeps();
    const result = await createVehicleProfile(deps, {
      driverId,
      name: '  Big Wagon  ',
      dimensions: dimensions(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      driverId,
      name: 'Big Wagon', // trimmed
      dimensions: dimensions(),
    });

    const stored = await deps.repo.findById(result.value.id);
    expect(stored).toEqual(result.value);
  });

  it('rejects a blank name without touching the repository', async () => {
    const deps = buildDeps();
    const result = await createVehicleProfile(deps, {
      driverId,
      name: '   ',
      dimensions: dimensions(),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidName' } });
    expect(await deps.repo.listForDriver(driverId)).toEqual([]);
  });

  it('rejects invalid dimensions without touching the repository', async () => {
    const deps = buildDeps();
    const result = await createVehicleProfile(deps, {
      driverId,
      name: 'Big Wagon',
      dimensions: dimensions({ heightM: 0 }),
    });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidDimensions', reason: 'must_be_positive' },
    });
    expect(await deps.repo.listForDriver(driverId)).toEqual([]);
  });
});
