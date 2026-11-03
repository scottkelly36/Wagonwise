import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Driver } from '../domain/driver.js';
import type { InviteCode } from '../domain/invite-code.js';
import { MAX_FAILED_PASSWORDS } from '../domain/password.js';
import {
  confirmPasswordReset,
  confirmSignup,
  passwordSignIn,
  requestPasswordReset,
  requestSignupCode,
  setPassword,
  verifyPasswordSignIn,
  type PasswordAccountDeps,
} from './password-accounts.js';
import { requestOtp } from './request-otp.js';
import { verifyOtp } from './verify-otp.js';
import { FakeOtpSender } from './testing/fake-otp-sender.js';
import { FakePasswordHasher } from './testing/fake-password-hasher.js';
import { FakeTokenSigner } from './testing/fake-token-signer.js';
import { InMemoryCredentialRepository } from './testing/in-memory-credential-repository.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from './testing/in-memory-otp-repository.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';
import { SequentialOtpCodeGenerator } from './testing/sequential-otp-code-generator.js';
import { SequentialRefreshTokenGenerator } from './testing/sequential-refresh-token-generator.js';

const EMAIL = 'sam@example.com';
const PASSWORD = 'a long enough password';

function build(overrides: Partial<PasswordAccountDeps> = {}) {
  const deps: PasswordAccountDeps = {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    credentialRepo: new InMemoryCredentialRepository(),
    otpRepo: new InMemoryOtpRepository(),
    otpSender: new FakeOtpSender(),
    otpCodeGenerator: new SequentialOtpCodeGenerator(),
    passwordHasher: new FakePasswordHasher(),
    sessionRepo: new InMemorySessionRepository(),
    tokenSigner: new FakeTokenSigner(),
    refreshTokenGenerator: new SequentialRefreshTokenGenerator(),
    unitOfWork: new InMemoryUnitOfWork(),
    inviteRequired: false,
    clock: new FakeClock('2026-11-01T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
  return { deps, sender: deps.otpSender as FakeOtpSender };
}

/** The last code that was "emailed". */
const lastCode = (sender: FakeOtpSender): string => sender.sent.at(-1)?.code ?? '';

async function signedUp(deps: PasswordAccountDeps, sender: FakeOtpSender): Promise<Driver> {
  await requestSignupCode(deps, { email: EMAIL });
  const result = await confirmSignup(deps, {
    email: EMAIL,
    password: PASSWORD,
    code: lastCode(sender),
  });
  if (!result.ok) throw new Error(`sign-up failed: ${result.error.tag}`);
  return result.value.driver;
}

describe('signing up', () => {
  it('sends a code, then makes the account and the password together and signs in', async () => {
    const { deps, sender } = build();
    expect(await requestSignupCode(deps, { email: ' Sam@Example.com ' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sender.sent).toEqual([{ identifier: EMAIL, code: '000001' }]);

    const result = await confirmSignup(deps, { email: EMAIL, password: PASSWORD, code: '000001' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.driver.identifier).toBe(EMAIL);
    expect(result.value.accessToken).not.toBe('');
    expect(result.value.refreshToken).not.toBe('');
    const credential = await deps.credentialRepo.findByDriverId(result.value.driver.id);
    expect(credential?.passwordHash).toBe(`hashed:${PASSWORD}`);
  });

  it('refuses a phone number, an address that already has an account, and a weak password', async () => {
    const { deps, sender } = build();
    expect(await requestSignupCode(deps, { email: '07700900123' })).toEqual({
      ok: false,
      error: { tag: 'EmailRequired' },
    });
    await signedUp(deps, sender);
    expect(await requestSignupCode(deps, { email: EMAIL })).toEqual({
      ok: false,
      error: { tag: 'AccountExists' },
    });

    const fresh = build();
    await requestSignupCode(fresh.deps, { email: 'new@example.com' });
    const weak = await confirmSignup(fresh.deps, {
      email: 'new@example.com',
      password: 'short',
      code: '000001',
    });
    expect(weak).toEqual({ ok: false, error: { tag: 'PasswordTooShort' } });
    // The weak password did not use up the code.
    const retry = await confirmSignup(fresh.deps, {
      email: 'new@example.com',
      password: PASSWORD,
      code: '000001',
    });
    expect(retry.ok).toBe(true);
  });

  it('refuses a wrong code and makes nothing', async () => {
    const { deps } = build();
    await requestSignupCode(deps, { email: EMAIL });
    const result = await confirmSignup(deps, { email: EMAIL, password: PASSWORD, code: '999999' });
    expect(result).toEqual({ ok: false, error: { tag: 'OtpIncorrect', attemptsRemaining: 4 } });
    expect(await deps.driverRepo.findByIdentifier(EMAIL)).toBeNull();
  });

  it('needs and redeems an invite code only while codes are required', async () => {
    const inviteCodeRepo = new InMemoryInviteCodeRepository();
    const invite: InviteCode = {
      code: 'HEXHAM24',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    inviteCodeRepo.seed(invite);
    const { deps, sender } = build({ inviteCodeRepo, inviteRequired: true });

    expect(await requestSignupCode(deps, { email: EMAIL })).toEqual({
      ok: false,
      error: { tag: 'InviteCodeRequired' },
    });
    expect(await requestSignupCode(deps, { email: EMAIL, inviteCode: 'NOPE' })).toEqual({
      ok: false,
      error: { tag: 'InvalidInviteCode' },
    });
    expect((await requestSignupCode(deps, { email: EMAIL, inviteCode: 'HEXHAM24' })).ok).toBe(true);
    const done = await confirmSignup(deps, {
      email: EMAIL,
      password: PASSWORD,
      code: lastCode(sender),
      inviteCode: 'HEXHAM24',
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect((await inviteCodeRepo.findByCode('HEXHAM24'))?.redeemedBy).toBe(done.value.driver.id);
  });
});

describe('signing in with a password and a code', () => {
  it('a right password sends a code, and the code signs in', async () => {
    const { deps, sender } = build();
    const driver = await signedUp(deps, sender);
    const before = sender.sent.length;

    expect(await passwordSignIn(deps, { identifier: EMAIL, password: PASSWORD })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sender.sent.length).toBe(before + 1);

    const result = await verifyPasswordSignIn(deps, { identifier: EMAIL, code: lastCode(sender) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.driver.id).toBe(driver.id);
  });

  it('a wrong password and an unknown email give the same answer, and send no code', async () => {
    const { deps, sender } = build();
    await signedUp(deps, sender);
    const before = sender.sent.length;
    const wrong = await passwordSignIn(deps, { identifier: EMAIL, password: 'not the password' });
    const unknown = await passwordSignIn(deps, {
      identifier: 'nobody@example.com',
      password: PASSWORD,
    });
    expect(wrong).toEqual({ ok: false, error: { tag: 'InvalidCredentials' } });
    expect(unknown).toEqual(wrong);
    expect(sender.sent.length).toBe(before);
  });

  it('locks the account after five wrong passwords, even for the right one, until the time is up', async () => {
    const clock = new FakeClock('2026-11-01T09:00:00.000Z');
    const { deps, sender } = build({ clock });
    await signedUp(deps, sender);
    for (let i = 0; i < MAX_FAILED_PASSWORDS; i++) {
      await passwordSignIn(deps, { identifier: EMAIL, password: 'wrong wrong wrong' });
    }
    expect(await passwordSignIn(deps, { identifier: EMAIL, password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'TooManyAttempts' },
    });
    clock.advance(16 * 60 * 1000);
    expect((await passwordSignIn(deps, { identifier: EMAIL, password: PASSWORD })).ok).toBe(true);
  });

  it('a code alone does not sign in to an account that has a password', async () => {
    const { deps, sender } = build();
    await signedUp(deps, sender);
    const code = { identifier: EMAIL };
    expect(await requestOtp({ ...deps, inviteRequired: false }, code)).toEqual({
      ok: false,
      error: { tag: 'PasswordRequired' },
    });
    expect(await verifyOtp(deps, { identifier: EMAIL, code: '000001' })).toEqual({
      ok: false,
      error: { tag: 'PasswordRequired' },
    });
  });

  it('only an account with a password can use the password code step', async () => {
    const { deps } = build();
    const driverId = makeId<'DriverId'>('plain-driver');
    await deps.driverRepo.save({
      id: driverId,
      identifier: 'plain@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(
      await verifyPasswordSignIn(deps, { identifier: 'plain@example.com', code: '000001' }),
    ).toEqual({ ok: false, error: { tag: 'InvalidCredentials' } });
  });
});

describe('a forgotten password', () => {
  it('a code lets them set a new one, ends their other sessions, and signs them in', async () => {
    const { deps, sender } = build();
    const driver = await signedUp(deps, sender);
    const oldSession = await verifyAfterSignIn(deps, sender);

    expect(await requestPasswordReset(deps, { email: EMAIL })).toEqual({
      ok: true,
      value: undefined,
    });
    const result = await confirmPasswordReset(deps, {
      email: EMAIL,
      code: lastCode(sender),
      newPassword: 'a brand new password',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.driver.id).toBe(driver.id);
    expect((await deps.credentialRepo.findByDriverId(driver.id))?.passwordHash).toBe(
      'hashed:a brand new password',
    );
    const stale = await deps.sessionRepo.findByRefreshTokenHash(
      (await import('./hash.js')).sha256Hex(oldSession),
    );
    expect(stale?.revokedAt).not.toBeNull();
  });

  it('says the same, and sends nothing, for an address with no account', async () => {
    const { deps, sender } = build();
    expect(await requestPasswordReset(deps, { email: 'nobody@example.com' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sender.sent).toEqual([]);
  });

  it('refuses a weak new password and a wrong code', async () => {
    const { deps, sender } = build();
    await signedUp(deps, sender);
    await requestPasswordReset(deps, { email: EMAIL });
    expect(
      await confirmPasswordReset(deps, {
        email: EMAIL,
        code: lastCode(sender),
        newPassword: 'tiny',
      }),
    ).toEqual({ ok: false, error: { tag: 'PasswordTooShort' } });
    const wrong = await confirmPasswordReset(deps, {
      email: EMAIL,
      code: '999999',
      newPassword: 'a brand new password',
    });
    expect(wrong.ok).toBe(false);
  });
});

/** Signs in the long way and returns the raw refresh token of that session. */
async function verifyAfterSignIn(
  deps: PasswordAccountDeps,
  sender: FakeOtpSender,
): Promise<string> {
  await passwordSignIn(deps, { identifier: EMAIL, password: PASSWORD });
  const result = await verifyPasswordSignIn(deps, { identifier: EMAIL, code: lastCode(sender) });
  if (!result.ok) throw new Error(`sign-in failed: ${result.error.tag}`);
  return result.value.refreshToken;
}

describe('adding a password to an existing account', () => {
  async function codeOnlyDriver(deps: PasswordAccountDeps, identifier: string): Promise<Driver> {
    const driver: Driver = {
      id: makeId<'DriverId'>('driver-9'),
      identifier,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    await deps.driverRepo.save(driver);
    return driver;
  }

  it('lets a driver with an email and no password add one, once; after that the code-only door is shut', async () => {
    const { deps } = build();
    const driver = await codeOnlyDriver(deps, EMAIL);

    expect(await setPassword(deps, { driverId: driver.id, password: PASSWORD })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await setPassword(deps, { driverId: driver.id, password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'PasswordAlreadySet' },
    });
    expect(await verifyOtp(deps, { identifier: EMAIL, code: '000001' })).toEqual({
      ok: false,
      error: { tag: 'PasswordRequired' },
    });
  });

  it('needs an email on the account (a phone-number driver cannot), and a strong enough password', async () => {
    const { deps } = build();
    const phone = await codeOnlyDriver(deps, '+447700900123');
    expect(await setPassword(deps, { driverId: phone.id, password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'EmailRequired' },
    });
    const { deps: other } = build();
    const driver = await codeOnlyDriver(other, EMAIL);
    expect(await setPassword(other, { driverId: driver.id, password: 'tiny' })).toEqual({
      ok: false,
      error: { tag: 'PasswordTooShort' },
    });
    expect(
      await setPassword(other, { driverId: makeId<'DriverId'>('nobody'), password: PASSWORD }),
    ).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });
});
