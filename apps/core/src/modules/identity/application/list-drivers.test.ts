import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { StubPlatformStaff } from './testing/stub-platform-staff.js';
import { listDrivers } from './list-drivers.js';
import type { Driver } from '../domain/driver.js';

const ADMIN = makeId<'StaffId'>('admin');

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'a@example.com',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    ...overrides,
  };
}

describe('listDrivers', () => {
  it('returns every driver to a WagonWise admin', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());
    await driverRepo.save(driver({ id: makeId<'DriverId'>('driver-2') }));

    const staff = new StubPlatformStaff(new Set([ADMIN]));
    const result = await listDrivers({ driverRepo, staff }, { callerId: ADMIN });
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('refuses anyone else, never a partial list', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());
    const staff = new StubPlatformStaff(new Set([ADMIN]));
    expect(
      await listDrivers({ driverRepo, staff }, { callerId: makeId<'StaffId'>('fleet-user') }),
    ).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });
});
