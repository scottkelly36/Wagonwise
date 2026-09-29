import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { SequentialInviteCodeGenerator } from './testing/sequential-invite-code-generator.js';
import { createInviteCode } from './create-invite-code.js';

const ADMIN = makeId<'DriverId'>('admin');
const DRIVER = makeId<'DriverId'>('driver');

async function setUp() {
  const driverRepo = new InMemoryDriverRepository();
  const base = { identifier: 'a@example.com', createdAt: new Date(), scopes: [] };
  await driverRepo.save({ ...base, id: ADMIN, isAdmin: true });
  await driverRepo.save({ ...base, id: DRIVER, isAdmin: false });
  const deps = {
    repo: new InMemoryInviteCodeRepository(),
    generator: new SequentialInviteCodeGenerator(),
    clock: new FakeClock(),
    driverRepo,
  };
  return deps;
}

describe('createInviteCode', () => {
  it('generates and persists a fresh, unredeemed code', async () => {
    const deps = await setUp();

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
    const deps = await setUp();

    const first = await createInviteCode(deps, { callerId: ADMIN });
    const second = await createInviteCode(deps, { callerId: ADMIN });

    if (!first.ok || !second.ok) throw new Error('expected both to succeed');
    expect(first.value.code).not.toBe(second.value.code);
  });

  it('refuses a non-admin, creating nothing', async () => {
    const deps = await setUp();

    expect(await createInviteCode(deps, { callerId: DRIVER })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deps.repo.findAll()).toEqual([]);
  });
});
