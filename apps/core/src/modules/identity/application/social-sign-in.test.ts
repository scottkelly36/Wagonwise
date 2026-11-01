import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { socialSignIn, type SocialSignInDeps } from './social-sign-in.js';
import { FakeIdTokenVerifier } from './testing/fake-id-token-verifier.js';
import { FakeTokenSigner } from './testing/fake-token-signer.js';
import { InMemoryCredentialRepository } from './testing/in-memory-credential-repository.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemoryFederatedIdentityRepository } from './testing/in-memory-federated-identity-repository.js';
import { InMemoryInviteCodeRepository } from './testing/in-memory-invite-code-repository.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';
import { SequentialRefreshTokenGenerator } from './testing/sequential-refresh-token-generator.js';

function build(overrides: Partial<SocialSignInDeps> = {}) {
  const idTokenVerifier = new FakeIdTokenVerifier();
  const deps: SocialSignInDeps = {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    credentialRepo: new InMemoryCredentialRepository(),
    federatedRepo: new InMemoryFederatedIdentityRepository(),
    idTokenVerifier,
    sessionRepo: new InMemorySessionRepository(),
    tokenSigner: new FakeTokenSigner(),
    refreshTokenGenerator: new SequentialRefreshTokenGenerator(),
    unitOfWork: new InMemoryUnitOfWork(),
    inviteRequired: false,
    clock: new FakeClock('2026-11-01T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
  return { deps, idTokenVerifier };
}

describe('socialSignIn', () => {
  it('makes an account for a new Google sign-in with a confirmed email, and links it', async () => {
    const { deps, idTokenVerifier } = build();
    idTokenVerifier.tokens.set('google:good', {
      subject: 'g-123',
      email: 'Sam@Example.com',
      emailVerified: true,
    });

    const result = await socialSignIn(deps, { provider: 'google', idToken: 'good' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.driver.identifier).toBe('sam@example.com');
    expect(result.value.accessToken).not.toBe('');
    const link = await deps.federatedRepo.find('google', 'g-123');
    expect(link?.driverId).toBe(result.value.driver.id);
  });

  it('finds a returning driver by the provider id, even if the email has changed or is missing', async () => {
    const { deps, idTokenVerifier } = build();
    idTokenVerifier.tokens.set('apple:first', {
      subject: 'a-1',
      email: 'sam@example.com',
      emailVerified: true,
    });
    const first = await socialSignIn(deps, { provider: 'apple', idToken: 'first' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    idTokenVerifier.tokens.set('apple:later', {
      subject: 'a-1',
      email: undefined,
      emailVerified: false,
    });
    const again = await socialSignIn(deps, { provider: 'apple', idToken: 'later' });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.driver.id).toBe(first.value.driver.id);
  });

  it('joins an existing account that has the same confirmed email, rather than making a second', async () => {
    const { deps, idTokenVerifier } = build();
    const id = makeId<'DriverId'>('driver-1');
    await deps.driverRepo.save({
      id,
      identifier: 'sam@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    idTokenVerifier.tokens.set('google:good', {
      subject: 'g-9',
      email: 'sam@example.com',
      emailVerified: true,
    });

    const result = await socialSignIn(deps, { provider: 'google', idToken: 'good' });
    expect(result.ok && result.value.driver.id).toBe(id);
    expect((await deps.federatedRepo.find('google', 'g-9'))?.driverId).toBe(id);
  });

  it('never joins or makes an account on an email the provider did not confirm', async () => {
    const { deps, idTokenVerifier } = build();
    await deps.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'victim@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    idTokenVerifier.tokens.set('google:sneaky', {
      subject: 'g-evil',
      email: 'victim@example.com',
      emailVerified: false,
    });
    expect(await socialSignIn(deps, { provider: 'google', idToken: 'sneaky' })).toEqual({
      ok: false,
      error: { tag: 'EmailNotVerified' },
    });
    expect(await deps.federatedRepo.find('google', 'g-evil')).toBeNull();
  });

  it('refuses a token that does not check out, and a provider that is not set up', async () => {
    const { deps, idTokenVerifier } = build();
    expect(await socialSignIn(deps, { provider: 'google', idToken: 'forged' })).toEqual({
      ok: false,
      error: { tag: 'InvalidIdToken' },
    });
    idTokenVerifier.unconfigured.add('apple');
    expect(await socialSignIn(deps, { provider: 'apple', idToken: 'any' })).toEqual({
      ok: false,
      error: { tag: 'ProviderNotConfigured' },
    });
  });

  it('needs an invite code for a brand new account only while codes are required', async () => {
    const { deps, idTokenVerifier } = build({ inviteRequired: true });
    idTokenVerifier.tokens.set('google:good', {
      subject: 'g-1',
      email: 'new@example.com',
      emailVerified: true,
    });
    expect(await socialSignIn(deps, { provider: 'google', idToken: 'good' })).toEqual({
      ok: false,
      error: { tag: 'InviteCodeRequired' },
    });
  });

  it('signs in an account that has a password without asking for it (the provider has already proved who they are)', async () => {
    const { deps, idTokenVerifier } = build();
    const id = makeId<'DriverId'>('driver-1');
    await deps.driverRepo.save({
      id,
      identifier: 'sam@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await deps.credentialRepo.save({
      driverId: id,
      passwordHash: 'x',
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    });
    idTokenVerifier.tokens.set('google:good', {
      subject: 'g-1',
      email: 'sam@example.com',
      emailVerified: true,
    });
    expect((await socialSignIn(deps, { provider: 'google', idToken: 'good' })).ok).toBe(true);
  });
});
