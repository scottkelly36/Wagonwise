import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { IdentityAdminDirectory } from './identity-admin-directory.js';

describe('IdentityAdminDirectory', () => {
  it('forwards to isDriverAdmin and returns true for an admin', async () => {
    const driverId = makeId<'DriverId'>('driver-1');
    const calls: string[] = [];
    const directory = new IdentityAdminDirectory({
      isDriverAdmin(id) {
        calls.push(id);
        return Promise.resolve(true);
      },
    });

    expect(await directory.isAdmin(driverId)).toBe(true);
    expect(calls).toEqual([driverId]);
  });

  it('returns false for a non-admin', async () => {
    const directory = new IdentityAdminDirectory({ isDriverAdmin: () => Promise.resolve(false) });
    expect(await directory.isAdmin(makeId<'DriverId'>('driver-2'))).toBe(false);
  });
});
