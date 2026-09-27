import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Driver } from '../domain/driver.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { updateDriver } from './update-driver.js';

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'a@example.com',
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    isAdmin: false,
    ...overrides,
  };
}

describe('updateDriver', () => {
  it('assigns a company', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());

    const companyId = makeId<'CompanyId'>('company-1');
    const result = await updateDriver({ driverRepo }, { id: driver().id, companyId });

    expect(result).toEqual({ ok: true, value: { ...driver(), companyId } });
    expect((await driverRepo.findById(driver().id))?.companyId).toBe(companyId);
  });

  it('clears a company assignment when companyId is null', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const companyId = makeId<'CompanyId'>('company-1');
    await driverRepo.save(driver({ companyId }));

    const result = await updateDriver({ driverRepo }, { id: driver().id, companyId: null });

    expect(result.ok).toBe(true);
    expect((await driverRepo.findById(driver().id))?.companyId).toBeUndefined();
  });

  it('leaves companyId untouched when omitted, even while changing isAdmin', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const companyId = makeId<'CompanyId'>('company-1');
    await driverRepo.save(driver({ companyId }));

    await updateDriver({ driverRepo }, { id: driver().id, isAdmin: true });

    const updated = await driverRepo.findById(driver().id);
    expect(updated?.companyId).toBe(companyId);
    expect(updated?.isAdmin).toBe(true);
  });

  it('sets isAdmin', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver());

    const result = await updateDriver({ driverRepo }, { id: driver().id, isAdmin: true });

    expect(result).toEqual({ ok: true, value: { ...driver(), isAdmin: true } });
  });

  it('returns DriverNotFound for an unknown id, without writing anything', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const result = await updateDriver(
      { driverRepo },
      { id: makeId<'DriverId'>('unknown'), isAdmin: true },
    );
    expect(result).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });
});
