import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { listInviteCodes } from './list-invite-codes.js';

const ADMIN = makeId<'DriverId'>('admin');
const DRIVER = makeId<'DriverId'>('driver');

async function setUp() {
  const driverRepo = new InMemoryDriverRepository();
  const base = { identifier: 'a@example.com', createdAt: new Date(), scopes: [] };
  await driverRepo.save({ ...base, id: ADMIN, isAdmin: true });
  await driverRepo.save({ ...base, id: DRIVER, isAdmin: false });
  return { repo: new InMemoryInviteCodeRepository(), driverRepo };
}

describe('listInviteCodes', () => {
  it('returns every invite code, redeemed or not', async () => {
    const deps = await setUp();
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
    const deps = await setUp();
    expect(await listInviteCodes(deps, { callerId: ADMIN })).toEqual({ ok: true, value: [] });
  });

  it('refuses a non-admin', async () => {
    const deps = await setUp();
    deps.repo.seed({ code: 'ACTIVE1', redeemedBy: null, redeemedAt: null, createdAt: new Date() });
    expect(await listInviteCodes(deps, { callerId: DRIVER })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
