import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { requirePlatformStaff } from './authorization.js';
import { StubPlatformStaff } from './testing/stub-platform-staff.js';

describe('requirePlatformStaff', () => {
  it('allows a WagonWise admin, and refuses anyone else', async () => {
    const staff = new StubPlatformStaff(new Set([makeId<'StaffId'>('admin')]));
    expect(await requirePlatformStaff(staff, makeId<'StaffId'>('admin'))).toEqual({
      ok: true,
      value: undefined,
    });
    for (const id of ['fleet-user', 'nobody']) {
      expect(await requirePlatformStaff(staff, makeId<'StaffId'>(id))).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});
