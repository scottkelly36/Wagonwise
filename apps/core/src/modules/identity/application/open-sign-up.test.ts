import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Driver } from '../domain/driver.js';
import { InMemorySendThrottle } from './in-memory-send-throttle.js';
import { acceptableNewIdentifier, signUpsPaused } from './new-account-guard.js';
import { requestOtp, type RequestOtpDeps } from './request-otp.js';
import { InMemoryCredentialRepository } from './testing/in-memory-credential-repository.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from './testing/in-memory-otp-repository.js';
import { FakeOtpSender } from './testing/fake-otp-sender.js';
import { SequentialOtpCodeGenerator } from './testing/sequential-otp-code-generator.js';

const clock = () => new FakeClock('2026-11-26T10:00:00.000Z');

function deps(overrides: Partial<RequestOtpDeps> = {}) {
  const c = clock();
  const base: RequestOtpDeps = {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    credentialRepo: new InMemoryCredentialRepository(),
    otpRepo: new InMemoryOtpRepository(),
    otpSender: new FakeOtpSender(),
    otpCodeGenerator: new SequentialOtpCodeGenerator(),
    inviteRequired: false, // open sign-up: the case these guards are for
    clock: c,
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
  return { d: base, sent: (base.otpSender as FakeOtpSender).sent, clock: c };
}

const driver = (identifier: string, createdAt = '2026-11-26T08:00:00.000Z'): Driver => ({
  id: makeId<'DriverId'>(`drv-${identifier}`),
  identifier,
  createdAt: new Date(createdAt),
  name: undefined,
  consentedAt: undefined,
  deletedAt: undefined,
});

describe('acceptableNewIdentifier: what a brand-new account must look like', () => {
  it('lets through a real email and a UK mobile', () => {
    expect(acceptableNewIdentifier('sam@example.com').ok).toBe(true);
    expect(acceptableNewIdentifier('+447700900123').ok).toBe(true);
    expect(acceptableNewIdentifier('+447123456789').ok).toBe(true);
  });

  it('turns away a throwaway email', () => {
    expect(acceptableNewIdentifier('x@mailinator.com')).toEqual({
      ok: false,
      error: { tag: 'DisposableEmail' },
    });
  });

  it('turns away a number that is not a UK mobile: abroad, a landline, a premium or personal range', () => {
    for (const number of [
      '+33612345678', // France
      '+12025550123', // US
      '+442079460958', // a London landline
      '+447000123456', // 070 personal numbers
      '+4479001234', // too short
      '+4477009001234', // too long
      '+8801712345678', // a country where texts are a pumping target
    ]) {
      expect(acceptableNewIdentifier(number)).toEqual({
        ok: false,
        error: { tag: 'UkMobileRequired' },
      });
    }
  });
});

describe('open sign-up: a new account by code', () => {
  it('sends a code to a real new email and a UK mobile, however they were typed', async () => {
    const { d, sent } = deps();
    expect((await requestOtp(d, { identifier: 'sam@example.com' })).ok).toBe(true);
    // 07… is stored as +44…, which is what the check reads.
    expect((await requestOtp(d, { identifier: '07700 900123' })).ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing to a throwaway email or a number abroad', async () => {
    const { d, sent } = deps();
    expect(await requestOtp(d, { identifier: 'bot@yopmail.com' })).toEqual({
      ok: false,
      error: { tag: 'DisposableEmail' },
    });
    expect(await requestOtp(d, { identifier: '+33612345678' })).toEqual({
      ok: false,
      error: { tag: 'UkMobileRequired' },
    });
    expect(sent).toHaveLength(0);
  });

  it('never asks an existing driver for a UK mobile or a real email: only new accounts are checked', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver('+353871234567')); // an Irish driver who signed up before
    await driverRepo.save(driver('old@mailinator.com'));
    const { d, sent } = deps({ driverRepo });
    expect((await requestOtp(d, { identifier: '+353871234567' })).ok).toBe(true);
    expect((await requestOtp(d, { identifier: 'old@mailinator.com' })).ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('refuses a new account once the day has had its limit, before any code is sent, and tells the owner', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver('a@example.com'));
    await driverRepo.save(driver('b@example.com'));
    let told = 0;
    const { d, sent } = deps({
      driverRepo,
      newDriversPerDay: 2,
      onSignUpsPaused: () => (told += 1),
    });
    expect(await requestOtp(d, { identifier: 'new@example.com' })).toEqual({
      ok: false,
      error: { tag: 'SignUpsPaused' },
    });
    expect(sent).toHaveLength(0);
    expect(told).toBe(1);
    // Someone who already has an account is not held by it.
    expect((await requestOtp(d, { identifier: 'a@example.com' })).ok).toBe(true);
  });

  it('counts only today: accounts made yesterday do not use up today', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver('a@example.com', '2026-11-25T23:00:00.000Z'));
    await driverRepo.save(driver('b@example.com', '2026-11-25T09:00:00.000Z'));
    const { d } = deps({ driverRepo, newDriversPerDay: 2 });
    expect((await requestOtp(d, { identifier: 'new@example.com' })).ok).toBe(true);
  });

  it('has no limit at 0', async () => {
    const { d, clock: c } = deps({ newDriversPerDay: 0 });
    expect(
      (await signUpsPaused({ driverRepo: d.driverRepo, newDriversPerDay: 0 }, c.now())).ok,
    ).toBe(true);
  });
});

describe('open sign-up: how often a code may go to one address or number', () => {
  it('holds a second code for half a minute with a 429-style answer, and the first code still works', async () => {
    const otpRepo = new InMemoryOtpRepository();
    const c = clock();
    const { d, sent } = deps({
      otpRepo,
      clock: c,
      sendThrottle: new InMemorySendThrottle(c, 0),
    });
    expect((await requestOtp(d, { identifier: 'sam@example.com' })).ok).toBe(true);
    const firstCode = (await otpRepo.findLatestFor('sam@example.com'))?.codeHash;
    const held = await requestOtp(d, { identifier: 'sam@example.com' });
    expect(held).toEqual({ ok: false, error: { tag: 'TooManyCodes', retryAfterSeconds: 30 } });
    expect(sent).toHaveLength(1);
    // The held request must not replace the code the person is already holding.
    expect((await otpRepo.findLatestFor('sam@example.com'))?.codeHash).toBe(firstCode);
  });

  it('shares one count between 07… and +44…, so retyping the number does not get round it', async () => {
    const c = clock();
    const { d, sent } = deps({ clock: c, sendThrottle: new InMemorySendThrottle(c, 0) });
    expect((await requestOtp(d, { identifier: '07700900123' })).ok).toBe(true);
    const again = await requestOtp(d, { identifier: '+447700900123' });
    expect(again.ok).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('answers the same for a known and an unknown address, so the limit does not say who has an account', async () => {
    const driverRepo = new InMemoryDriverRepository();
    await driverRepo.save(driver('known@example.com'));
    const c = clock();
    const { d } = deps({ driverRepo, clock: c, sendThrottle: new InMemorySendThrottle(c, 0) });
    await requestOtp(d, { identifier: 'known@example.com' });
    await requestOtp(d, { identifier: 'unknown@example.com' });
    const known = await requestOtp(d, { identifier: 'known@example.com' });
    const unknown = await requestOtp(d, { identifier: 'unknown@example.com' });
    expect(known).toEqual(unknown);
  });

  it('pauses texts when the day budget is used up, with a different answer from "too often", and email still goes', async () => {
    const c = clock();
    const { d, sent } = deps({ clock: c, sendThrottle: new InMemorySendThrottle(c, 1) });
    expect((await requestOtp(d, { identifier: '+447700900001' })).ok).toBe(true);
    expect(await requestOtp(d, { identifier: '+447700900002' })).toEqual({
      ok: false,
      error: { tag: 'SendsPaused' },
    });
    expect((await requestOtp(d, { identifier: 'sam@example.com' })).ok).toBe(true);
    expect(sent).toHaveLength(2);
  });
});
