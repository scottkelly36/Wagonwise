import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { InviteCode } from '../domain/invite-code.js';
import { makeId } from '../../../shared/brand.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from './testing/in-memory-otp-repository.js';
import { FakeOtpSender } from './testing/fake-otp-sender.js';
import { SequentialOtpCodeGenerator } from './testing/sequential-otp-code-generator.js';
import { OTP_TTL_MS, requestOtp, type RequestOtpDeps } from './request-otp.js';

function buildDeps(overrides: Partial<RequestOtpDeps> = {}): RequestOtpDeps {
  return {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    otpRepo: new InMemoryOtpRepository(),
    otpSender: new FakeOtpSender(),
    otpCodeGenerator: new SequentialOtpCodeGenerator(),
    clock: new FakeClock('2026-06-15T08:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
}

describe('requestOtp', () => {
  it('rejects a malformed identifier before touching any repository', async () => {
    const deps = buildDeps();
    const result = await requestOtp(deps, { identifier: 'not-an-identifier' });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidIdentifier', reason: 'not_email_or_phone' },
    });
    expect((deps.otpSender as FakeOtpSender).sent).toEqual([]);
  });

  it('requires an invite code for an identifier with no existing driver', async () => {
    const deps = buildDeps();
    const result = await requestOtp(deps, { identifier: 'new@example.com' });
    expect(result).toEqual({ ok: false, error: { tag: 'InviteCodeRequired' } });
    expect((deps.otpSender as FakeOtpSender).sent).toEqual([]);
  });

  it('rejects an unknown invite code', async () => {
    const deps = buildDeps();
    const result = await requestOtp(deps, {
      identifier: 'new@example.com',
      inviteCode: 'NOPE',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidInviteCode' } });
  });

  it('rejects an already-redeemed invite code', async () => {
    const inviteCodeRepo = new InMemoryInviteCodeRepository();
    const redeemed: InviteCode = {
      code: 'HEXHAM24',
      redeemedBy: makeId<'DriverId'>('someone-else'),
      redeemedAt: new Date('2026-06-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    inviteCodeRepo.seed(redeemed);
    const deps = buildDeps({ inviteCodeRepo });

    const result = await requestOtp(deps, {
      identifier: 'new@example.com',
      inviteCode: 'HEXHAM24',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidInviteCode' } });
  });

  it('sends a code for a new identifier with a valid invite code, without redeeming it yet', async () => {
    const inviteCodeRepo = new InMemoryInviteCodeRepository();
    const fresh: InviteCode = {
      code: 'HEXHAM24',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    inviteCodeRepo.seed(fresh);
    const deps = buildDeps({ inviteCodeRepo });

    const result = await requestOtp(deps, {
      identifier: 'new@example.com',
      inviteCode: 'HEXHAM24',
    });
    expect(result).toEqual({ ok: true, value: undefined });

    const stillUnredeemed = await inviteCodeRepo.findByCode('HEXHAM24');
    expect(stillUnredeemed).toEqual(fresh); // request alone never redeems

    const sender = deps.otpSender as FakeOtpSender;
    expect(sender.sent).toEqual([{ identifier: 'new@example.com', code: '000001' }]);
  });

  it('sends a code for an existing driver without needing an invite code', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const deps = buildDeps({ driverRepo });

    const result = await requestOtp(deps, { identifier: 'driver@example.com' });
    expect(result).toEqual({ ok: true, value: undefined });
    expect((deps.otpSender as FakeOtpSender).sent).toEqual([
      { identifier: 'driver@example.com', code: '000001' },
    ]);
  });

  it('stores the OTP hashed, not raw, with the configured expiry', async () => {
    const otpRepo = new InMemoryOtpRepository();
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const deps = buildDeps({ driverRepo, otpRepo });

    await requestOtp(deps, { identifier: 'driver@example.com' });

    const stored = await otpRepo.findLatestFor('driver@example.com');
    expect(stored).not.toBeNull();
    expect(stored?.codeHash).not.toBe('000001'); // hashed, not raw
    expect(stored?.expiresAt).toEqual(
      new Date(Date.parse('2026-06-15T08:00:00.000Z') + OTP_TTL_MS),
    );
    expect(stored?.attempts).toBe(0);
    expect(stored?.consumedAt).toBeNull();
  });

  it('normalises the identifier before using it as the lookup/storage key', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const deps = buildDeps({ driverRepo });

    await requestOtp(deps, { identifier: '  Driver@Example.com  ' });
    expect((deps.otpSender as FakeOtpSender).sent).toEqual([
      { identifier: 'driver@example.com', code: '000001' },
    ]);
  });
});
