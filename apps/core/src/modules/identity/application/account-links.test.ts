import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Driver } from '../domain/driver.js';
import {
  confirmEmailAddition,
  linkSocial,
  requestEmailAddition,
  type AccountLinkDeps,
} from './account-links.js';
import { FakeIdTokenVerifier } from './testing/fake-id-token-verifier.js';
import { FakeOtpSender } from './testing/fake-otp-sender.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryFederatedIdentityRepository } from './testing/in-memory-federated-identity-repository.js';
import { InMemoryOtpRepository } from './testing/in-memory-otp-repository.js';
import { SequentialOtpCodeGenerator } from './testing/sequential-otp-code-generator.js';

const PHONE = '+447700900123';

function build() {
  const idTokenVerifier = new FakeIdTokenVerifier();
  const otpSender = new FakeOtpSender();
  const deps: AccountLinkDeps = {
    driverRepo: new InMemoryDriverRepository(),
    federatedRepo: new InMemoryFederatedIdentityRepository(),
    idTokenVerifier,
    otpRepo: new InMemoryOtpRepository(),
    otpSender,
    otpCodeGenerator: new SequentialOtpCodeGenerator(),
    clock: new FakeClock('2026-11-01T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  return { deps, idTokenVerifier, otpSender };
}

async function driver(deps: AccountLinkDeps, id: string, identifier: string): Promise<Driver> {
  const made: Driver = {
    id: makeId<'DriverId'>(id),
    identifier,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  await deps.driverRepo.save(made);
  return made;
}

describe('linkSocial', () => {
  it('adds a Google login to a phone-number account, so signing in with it finds that account', async () => {
    const { deps, idTokenVerifier } = build();
    const phone = await driver(deps, 'driver-1', PHONE);
    idTokenVerifier.tokens.set('google:good', {
      subject: 'g-1',
      email: 'sam@gmail.com',
      emailVerified: true,
    });

    expect(
      await linkSocial(deps, { driverId: phone.id, provider: 'google', idToken: 'good' }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    const link = await deps.federatedRepo.find('google', 'g-1');
    expect(link?.driverId).toBe(phone.id);
    expect(link?.email).toBe('sam@gmail.com');
  });

  it('is fine to do twice, and refuses a login that already belongs to another account', async () => {
    const { deps, idTokenVerifier } = build();
    const first = await driver(deps, 'driver-1', PHONE);
    const second = await driver(deps, 'driver-2', 'kim@example.com');
    idTokenVerifier.tokens.set('apple:good', {
      subject: 'a-1',
      email: undefined,
      emailVerified: false,
    });

    await linkSocial(deps, { driverId: first.id, provider: 'apple', idToken: 'good' });
    expect(
      (await linkSocial(deps, { driverId: first.id, provider: 'apple', idToken: 'good' })).ok,
    ).toBe(true);
    expect(
      await linkSocial(deps, { driverId: second.id, provider: 'apple', idToken: 'good' }),
    ).toEqual({
      ok: false,
      error: { tag: 'AlreadyLinked' },
    });
    expect((await deps.federatedRepo.find('apple', 'a-1'))?.driverId).toBe(first.id);
  });

  it('refuses a token that does not check out, and an unknown driver', async () => {
    const { deps } = build();
    const phone = await driver(deps, 'driver-1', PHONE);
    expect(
      await linkSocial(deps, { driverId: phone.id, provider: 'google', idToken: 'forged' }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidIdToken' },
    });
    expect(
      await linkSocial(deps, {
        driverId: makeId<'DriverId'>('nobody'),
        provider: 'google',
        idToken: 'x',
      }),
    ).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });
});

describe('adding an email to a phone-number account', () => {
  it('a code to the new address, then the email becomes the sign-in and everything else is kept', async () => {
    const { deps, otpSender } = build();
    const phone = await driver(deps, 'driver-1', PHONE);

    expect(
      await requestEmailAddition(deps, { driverId: phone.id, email: ' Sam@Example.com ' }),
    ).toEqual({ ok: true, value: undefined });
    expect(otpSender.sent).toEqual([{ identifier: 'sam@example.com', code: '000001' }]);

    const done = await confirmEmailAddition(deps, {
      driverId: phone.id,
      email: 'sam@example.com',
      code: '000001',
    });
    expect(done.ok).toBe(true);
    const stored = await deps.driverRepo.findById(phone.id);
    expect(stored?.identifier).toBe('sam@example.com');
    expect(stored?.id).toBe(phone.id);
    expect(await deps.driverRepo.findByIdentifier(PHONE)).toBeNull();
  });

  it('refuses a wrong code and changes nothing', async () => {
    const { deps } = build();
    const phone = await driver(deps, 'driver-1', PHONE);
    await requestEmailAddition(deps, { driverId: phone.id, email: 'sam@example.com' });
    const wrong = await confirmEmailAddition(deps, {
      driverId: phone.id,
      email: 'sam@example.com',
      code: '999999',
    });
    expect(wrong.ok).toBe(false);
    expect((await deps.driverRepo.findById(phone.id))?.identifier).toBe(PHONE);
  });

  it('refuses an address another account uses, an account that already has an email, and a non-email', async () => {
    const { deps } = build();
    const phone = await driver(deps, 'driver-1', PHONE);
    await driver(deps, 'driver-2', 'taken@example.com');
    const hasEmail = await driver(deps, 'driver-3', 'has@example.com');

    expect(
      await requestEmailAddition(deps, { driverId: phone.id, email: 'taken@example.com' }),
    ).toEqual({
      ok: false,
      error: { tag: 'AccountExists' },
    });
    expect(
      await requestEmailAddition(deps, { driverId: hasEmail.id, email: 'new@example.com' }),
    ).toEqual({
      ok: false,
      error: { tag: 'EmailAlreadySet' },
    });
    expect(await requestEmailAddition(deps, { driverId: phone.id, email: '07700900999' })).toEqual({
      ok: false,
      error: { tag: 'EmailRequired' },
    });
  });
});
