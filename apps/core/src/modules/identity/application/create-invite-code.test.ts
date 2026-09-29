import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { SequentialInviteCodeGenerator } from './testing/sequential-invite-code-generator.js';
import { StubPlatformStaff } from './testing/stub-platform-staff.js';
import { createInviteCode } from './create-invite-code.js';

const ADMIN = makeId<'StaffId'>('admin');
const FLEET_USER = makeId<'StaffId'>('fleet-user');

function setUp() {
  return {
    repo: new InMemoryInviteCodeRepository(),
    generator: new SequentialInviteCodeGenerator(),
    clock: new FakeClock(),
    staff: new StubPlatformStaff(new Set([ADMIN])),
  };
}

describe('createInviteCode', () => {
  it('generates and persists a fresh, unredeemed code', async () => {
    const deps = setUp();

    const result = await createInviteCode(deps, { callerId: ADMIN });

    const invite = {
      code: 'CODE1',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: deps.clock.now(),
    };
    expect(result).toEqual({ ok: true, value: invite });
    expect(await deps.repo.findByCode('CODE1')).toEqual(invite);
  });

  it('generates a different code on each call', async () => {
    const deps = setUp();

    const first = await createInviteCode(deps, { callerId: ADMIN });
    const second = await createInviteCode(deps, { callerId: ADMIN });

    if (!first.ok || !second.ok) throw new Error('expected both to succeed');
    expect(first.value.code).not.toBe(second.value.code);
  });

  it('refuses anyone but a WagonWise admin, creating nothing', async () => {
    const deps = setUp();

    expect(await createInviteCode(deps, { callerId: FLEET_USER })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deps.repo.findAll()).toEqual([]);
  });
});
