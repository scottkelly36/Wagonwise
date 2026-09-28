import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { requireAdmin } from './authorization.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';

const base = { identifier: 'a@example.com', createdAt: new Date(), scopes: [] };

describe('requireAdmin', () => {
  it('allows an admin, and refuses a non-admin or an unknown caller alike', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save({ ...base, id: makeId<'DriverId'>('admin'), isAdmin: true });
    await driverRepo.save({ ...base, id: makeId<'DriverId'>('driver'), isAdmin: false });

    expect(await requireAdmin(driverRepo, makeId<'DriverId'>('admin'))).toEqual({
      ok: true,
      value: undefined,
    });
    for (const id of ['driver', 'nobody']) {
      expect(await requireAdmin(driverRepo, makeId<'DriverId'>(id))).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});
