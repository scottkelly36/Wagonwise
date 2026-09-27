import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { listInviteCodes } from './list-invite-codes.js';

describe('listInviteCodes', () => {
  it('returns every invite code, redeemed or not', async () => {
    const repo = new InMemoryInviteCodeRepository();
    repo.seed({ code: 'ACTIVE1', redeemedBy: null, redeemedAt: null, createdAt: new Date() });
    repo.seed({
      code: 'USED1',
      redeemedBy: makeId<'DriverId'>('driver-1'),
      redeemedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await listInviteCodes({ repo });
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when there are no codes', async () => {
    const repo = new InMemoryInviteCodeRepository();
    expect(await listInviteCodes({ repo })).toEqual([]);
  });
});
