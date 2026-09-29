import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { StubPlatformStaff } from './testing/stub-platform-staff.js';
import { listInviteCodes } from './list-invite-codes.js';

const ADMIN = makeId<'StaffId'>('admin');

function setUp() {
  return {
    repo: new InMemoryInviteCodeRepository(),
    staff: new StubPlatformStaff(new Set([ADMIN])),
  };
}

describe('listInviteCodes', () => {
  it('returns every invite code, redeemed or not', async () => {
    const deps = setUp();
    deps.repo.seed({ code: 'ACTIVE1', redeemedBy: null, redeemedAt: null, createdAt: new Date() });
    deps.repo.seed({
      code: 'USED1',
      redeemedBy: makeId<'DriverId'>('driver-1'),
      redeemedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await listInviteCodes(deps, { callerId: ADMIN });
    expect(result.ok && result.value).toHaveLength(2);
  });

  it('returns an empty array when there are no codes', async () => {
    const deps = setUp();
    expect(await listInviteCodes(deps, { callerId: ADMIN })).toEqual({ ok: true, value: [] });
  });

  it('refuses anyone but a WagonWise admin', async () => {
    const deps = setUp();
    deps.repo.seed({ code: 'ACTIVE1', redeemedBy: null, redeemedAt: null, createdAt: new Date() });
    expect(await listInviteCodes(deps, { callerId: makeId<'StaffId'>('fleet-user') })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
