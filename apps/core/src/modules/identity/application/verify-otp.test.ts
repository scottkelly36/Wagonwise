import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Driver } from '../domain/driver.js';
import type { InviteCode } from '../domain/invite-code.js';
import { MAX_OTP_ATTEMPTS, type Otp } from '../domain/otp.js';
import { sha256Hex } from './hash.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { FakeTokenSigner } from './testing/fake-token-signer.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from './testing/in-memory-otp-repository.js';
import { SequentialRefreshTokenGenerator } from './testing/sequential-refresh-token-generator.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';
import { verifyOtp, type VerifyOtpDeps } from './verify-otp.js';

const IDENTIFIER = 'driver@example.com';
const CODE = '654321';
const now = new Date('2026-06-15T08:00:00.000Z');

function buildDeps(overrides: Partial<VerifyOtpDeps> = {}): VerifyOtpDeps {
  return {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    otpRepo: new InMemoryOtpRepository(),
    sessionRepo: new InMemorySessionRepository(),
    tokenSigner: new FakeTokenSigner(),
    refreshTokenGenerator: new SequentialRefreshTokenGenerator(),
    unitOfWork: new InMemoryUnitOfWork(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
}

async function seedOtp(
  otpRepo: InMemoryOtpRepository,
  overrides: Partial<Otp> = {},
): Promise<void> {
  const otp: Otp = {
    id: 'otp-1',
    codeHash: sha256Hex(CODE),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    consumedAt: null,
    attempts: 0,
    ...overrides,
  };
  await otpRepo.save(IDENTIFIER, otp);
}

function existingDriver(): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: IDENTIFIER,
    createdAt: now,
  };
}

describe('verifyOtp: the code itself', () => {
  it('reports OtpNotFound when nothing was ever requested', async () => {
    const deps = buildDeps();
    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result).toEqual({ ok: false, error: { tag: 'OtpNotFound' } });
  });

  it('rejects the wrong code and does not create a session', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo);
    const sessionRepo = new InMemorySessionRepository();
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(existingDriver());
    const deps = buildDeps({ otpRepo, sessionRepo, driverRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: '000000' });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'OtpIncorrect', attemptsRemaining: MAX_OTP_ATTEMPTS - 1 },
    });

    const stored = await otpRepo.findLatestFor(IDENTIFIER);
    expect(stored?.attempts).toBe(1); // still persisted, even on failure
  });

  it('rejects an expired code', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo, { expiresAt: new Date(now.getTime() - 1) });
    const deps = buildDeps({ otpRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result).toEqual({ ok: false, error: { tag: 'OtpExpired' } });
  });

  it('rejects a code that has already been consumed', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo, { consumedAt: new Date(now.getTime() - 1000) });
    const deps = buildDeps({ otpRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result).toEqual({ ok: false, error: { tag: 'OtpAlreadyConsumed' } });
  });

  it('locks out after too many wrong attempts', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo, { attempts: MAX_OTP_ATTEMPTS });
    const deps = buildDeps({ otpRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result).toEqual({ ok: false, error: { tag: 'TooManyAttempts' } });
  });
});

describe('verifyOtp: existing driver', () => {
  it('issues a session without touching invite codes at all', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo);
    const driverRepo = new InMemoryDriverRepository();
    const driver = existingDriver();
    await driverRepo.save(driver);
    const sessionRepo = new InMemorySessionRepository();
    const deps = buildDeps({ otpRepo, driverRepo, sessionRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.driver).toEqual(driver);
    expect(result.value.refreshToken).toBe('refresh-token-1');
    expect(result.value.accessToken).toContain(driver.id);

    const session = await sessionRepo.findByRefreshTokenHash(sha256Hex('refresh-token-1'));
    expect(session).not.toBeNull();
    expect(session?.driverId).toBe(driver.id);
  });
});

describe('verifyOtp: new driver', () => {
  it('requires an invite code', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo);
    const deps = buildDeps({ otpRepo });

    const result = await verifyOtp(deps, { identifier: IDENTIFIER, code: CODE });
    expect(result).toEqual({ ok: false, error: { tag: 'InviteCodeRequired' } });
  });

  it('rejects an unknown or already-redeemed invite code', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo);
    const inviteCodeRepo = new InMemoryInviteCodeRepository();
    inviteCodeRepo.seed({
      code: 'USED',
      redeemedBy: makeId<'DriverId'>('someone-else'),
      redeemedAt: new Date(now.getTime() - 1000),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const deps = buildDeps({ otpRepo, inviteCodeRepo });

    const result = await verifyOtp(deps, {
      identifier: IDENTIFIER,
      code: CODE,
      inviteCode: 'USED',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidInviteCode' } });
  });

  it('creates the driver, redeems the invite code, and issues a session — atomically', async () => {
    const otpRepo = new InMemoryOtpRepository();
    await seedOtp(otpRepo);
    const inviteCodeRepo = new InMemoryInviteCodeRepository();
    const invite: InviteCode = {
      code: 'HEXHAM24',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    inviteCodeRepo.seed(invite);
    const driverRepo = new InMemoryDriverRepository();
    const sessionRepo = new InMemorySessionRepository();
    const unitOfWork = new InMemoryUnitOfWork();
    const deps = buildDeps({ otpRepo, inviteCodeRepo, driverRepo, sessionRepo, unitOfWork });

    const result = await verifyOtp(deps, {
      identifier: IDENTIFIER,
      code: CODE,
      inviteCode: 'HEXHAM24',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.driver.identifier).toBe(IDENTIFIER);
    expect(unitOfWork.committed).toBe(1);
    expect(unitOfWork.rolledBack).toBe(0);

    const storedDriver = await driverRepo.findByIdentifier(IDENTIFIER);
    expect(storedDriver).toEqual(result.value.driver);

    const redeemedInvite = await inviteCodeRepo.findByCode('HEXHAM24');
    expect(redeemedInvite?.redeemedBy).toBe(result.value.driver.id);
    expect(redeemedInvite?.redeemedAt).toEqual(now);

    const session = await sessionRepo.findByRefreshTokenHash(sha256Hex('refresh-token-1'));
    expect(session?.driverId).toBe(result.value.driver.id);
  });
});
