import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Driver } from '../domain/driver.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { StubPlatformStaff } from './testing/stub-platform-staff.js';
import { updateDriver } from './update-driver.js';

const ADMIN = makeId<'StaffId'>('admin');
const staff = new StubPlatformStaff(new Set([ADMIN]));

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'a@example.com',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    ...overrides,
  };
}

describe('updateDriver', () => {
  it('assigns a company', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());

    const companyId = makeId<'CompanyId'>('company-1');
    const result = await updateDriver(
      { driverRepo, staff },
      { callerId: ADMIN, id: driver().id, companyId },
    );

    expect(result).toEqual({ ok: true, value: { ...driver(), companyId } });
    expect((await driverRepo.findById(driver().id))?.companyId).toBe(companyId);
  });

  it('clears a company assignment when companyId is null', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver({ companyId: makeId<'CompanyId'>('company-1') }));

    const result = await updateDriver(
      { driverRepo, staff },
      { callerId: ADMIN, id: driver().id, companyId: null },
    );

    expect(result.ok).toBe(true);
    expect((await driverRepo.findById(driver().id))?.companyId).toBeUndefined();
  });

  it('leaves the company untouched when omitted', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const companyId = makeId<'CompanyId'>('company-1');
    await driverRepo.save(driver({ companyId }));

    await updateDriver({ driverRepo, staff }, { callerId: ADMIN, id: driver().id });

    expect((await driverRepo.findById(driver().id))?.companyId).toBe(companyId);
  });

  it('returns DriverNotFound for an unknown id, without writing anything', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const result = await updateDriver(
      { driverRepo, staff },
      { callerId: ADMIN, id: makeId<'DriverId'>('unknown'), companyId: null },
    );
    expect(result).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });

  it('refuses anyone but a WagonWise admin before looking at the target, so ids stay unguessable', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());

    for (const id of [driver().id, makeId<'DriverId'>('unknown')]) {
      const result = await updateDriver(
        { driverRepo, staff },
        { callerId: makeId<'StaffId'>('fleet-user'), id, companyId: null },
      );
      expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    }
  });
});
