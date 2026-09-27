import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { listDrivers } from './list-drivers.js';
import type { Driver } from '../domain/driver.js';

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'a@example.com',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    isAdmin: false,
    ...overrides,
  };
}

describe('listDrivers', () => {
  it('returns every driver', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());
    await driverRepo.save(driver({ id: makeId<'DriverId'>('driver-2') }));

    const result = await listDrivers({ driverRepo });
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when there are no drivers', async () => {
    const driverRepo = new InMemoryDriverRepository();
    expect(await listDrivers({ driverRepo })).toEqual([]);
  });
});
