import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { SequentialInviteCodeGenerator } from './testing/sequential-invite-code-generator.js';
import { createInviteCode } from './create-invite-code.js';

describe('createInviteCode', () => {
  it('generates and persists a fresh, unredeemed code', async () => {
    const repo = new InMemoryInviteCodeRepository();
    const clock = new FakeClock();
    const generator = new SequentialInviteCodeGenerator();

    const invite = await createInviteCode({ repo, generator, clock });

    expect(invite).toEqual({
      code: 'CODE1',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: clock.now(),
    });
    expect(await repo.findByCode('CODE1')).toEqual(invite);
  });

  it('generates a different code on each call', async () => {
    const repo = new InMemoryInviteCodeRepository();
    const clock = new FakeClock();
    const generator = new SequentialInviteCodeGenerator();

    const first = await createInviteCode({ repo, generator, clock });
    const second = await createInviteCode({ repo, generator, clock });

    expect(first.code).not.toBe(second.code);
  });
});
