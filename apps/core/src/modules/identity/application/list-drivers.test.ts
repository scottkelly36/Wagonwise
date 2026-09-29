import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { listDrivers } from './list-drivers.js';
import type { Driver } from '../domain/driver.js';

const ADMIN = makeId<'DriverId'>('admin');

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'a@example.com',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    isAdmin: false,
    scopes: [],
    ...overrides,
  };
}

describe('listDrivers', () => {
  it('returns every driver to an admin', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver({ id: ADMIN, isAdmin: true }));
    await driverRepo.save(driver());
    await driverRepo.save(driver({ id: makeId<'DriverId'>('driver-2') }));

    const result = await listDrivers({ driverRepo }, { callerId: ADMIN });
    expect(result.ok && result.value).toHaveLength(3);
  });

  it('refuses a non-admin, never a partial list', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());
    expect(await listDrivers({ driverRepo }, { callerId: driver().id })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
