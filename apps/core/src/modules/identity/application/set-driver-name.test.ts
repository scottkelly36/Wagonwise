import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { MAX_DRIVER_NAME_LENGTH, type Driver } from '../domain/driver.js';
import { setDriverName } from './set-driver-name.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';

const driver: Driver = {
  id: makeId<'DriverId'>('driver-1'),
  identifier: 'driver1@example.com',
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
};

async function setup() {
  const driverRepo = new InMemoryDriverRepository();
  await driverRepo.save(driver);
  return { driverRepo, deps: { driverRepo } };
}

describe('setDriverName', () => {
  it('stores the name, tidied', async () => {
    const { driverRepo, deps } = await setup();
    const result = await setDriverName(deps, { driverId: driver.id, name: '  Dave   Kelly ' });
    expect(result.ok && result.value.name).toBe('Dave Kelly');
    expect((await driverRepo.findById(driver.id))?.name).toBe('Dave Kelly');
  });

  it('clears the name when given nothing', async () => {
    const { driverRepo, deps } = await setup();
    await setDriverName(deps, { driverId: driver.id, name: 'Dave' });
    await setDriverName(deps, { driverId: driver.id, name: '   ' });
    expect((await driverRepo.findById(driver.id))?.name).toBeUndefined();
  });

  it('refuses a name that is too long rather than cutting it off', async () => {
    const { driverRepo, deps } = await setup();
    const result = await setDriverName(deps, {
      driverId: driver.id,
      name: 'x'.repeat(MAX_DRIVER_NAME_LENGTH + 1),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'NameTooLong' } });
    expect((await driverRepo.findById(driver.id))?.name).toBeUndefined();
  });

  it('reports an unknown driver', async () => {
    const { deps } = await setup();
    const result = await setDriverName(deps, {
      driverId: makeId<'DriverId'>('nope'),
      name: 'Dave',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });
});
