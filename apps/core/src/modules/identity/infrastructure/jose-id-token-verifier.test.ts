import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JoseIdTokenVerifier } from './jose-id-token-verifier.js';

const GOOGLE_CLIENT = 'web.apps.googleusercontent.com';
const APPLE_CLIENT = 'uk.co.wagonwise.driver';

describe('JoseIdTokenVerifier', () => {
  let privateKey: CryptoKey;
  let verifier: JoseIdTokenVerifier;
  let otherKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    // The providers' published keys are replaced by ours, so nothing here touches the network.
    verifier = new JoseIdTokenVerifier({
      googleClientIds: [GOOGLE_CLIENT, 'ios.apps.googleusercontent.com'],
      appleClientIds: [APPLE_CLIENT],
      keys: {
        google: () => Promise.resolve(pair.publicKey),
        apple: () => Promise.resolve(pair.publicKey),
      },
    });
  });

  async function token(
    claims: Record<string, unknown>,
    options: { issuer: string; audience: string; key?: CryptoKey; expires?: string },
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setIssuedAt()
      .setExpirationTime(options.expires ?? '10m')
      .sign(options.key ?? privateKey);
  }

  it('accepts a Google token made for our client and reads who it is for', async () => {
    const jwt = await token(
      { sub: 'g-123', email: 'sam@example.com', email_verified: true },
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT },
    );
    expect(await verifier.verify('google', jwt)).toEqual({
      ok: true,
      value: { subject: 'g-123', email: 'sam@example.com', emailVerified: true },
    });
  });

  it("accepts either spelling of Google's issuer, and any of our client ids", async () => {
    const jwt = await token(
      { sub: 'g-1', email: 'a@b.co', email_verified: true },
      { issuer: 'accounts.google.com', audience: 'ios.apps.googleusercontent.com' },
    );
    expect((await verifier.verify('google', jwt)).ok).toBe(true);
  });

  it('reads Apple\'s email_verified, which may be the string "true"', async () => {
    const jwt = await token(
      { sub: 'a-1', email: 'x@privaterelay.appleid.com', email_verified: 'true' },
      { issuer: 'https://appleid.apple.com', audience: APPLE_CLIENT },
    );
    expect(await verifier.verify('apple', jwt)).toEqual({
      ok: true,
      value: { subject: 'a-1', email: 'x@privaterelay.appleid.com', emailVerified: true },
    });
  });

  it('treats a missing or false email_verified as not confirmed', async () => {
    const jwt = await token(
      { sub: 'g-2', email: 'a@b.co' },
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT },
    );
    const result = await verifier.verify('google', jwt);
    expect(result.ok && result.value.emailVerified).toBe(false);
  });

  it.each([
    [
      'signed with another key',
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT, key: 'other' },
    ],
    [
      'made for another app',
      { issuer: 'https://accounts.google.com', audience: 'someone-elses-app' },
    ],
    ['from another issuer', { issuer: 'https://evil.example.com', audience: GOOGLE_CLIENT }],
    [
      'already expired',
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT, expires: '-1m' },
    ],
  ])('refuses a token %s', async (_name, options) => {
    const { key, ...rest } = options as {
      key?: string;
      issuer: string;
      audience: string;
      expires?: string;
    };
    const jwt = await token(
      { sub: 'g-1', email: 'a@b.co', email_verified: true },
      { ...rest, ...(key === 'other' ? { key: otherKey } : {}) },
    );
    expect(await verifier.verify('google', jwt)).toEqual({
      ok: false,
      error: { tag: 'InvalidIdToken' },
    });
  });

  it('refuses something that is not a token at all', async () => {
    expect(await verifier.verify('google', 'not-a-jwt')).toEqual({
      ok: false,
      error: { tag: 'InvalidIdToken' },
    });
  });

  it('refuses a token with no subject', async () => {
    const jwt = await token(
      { email: 'a@b.co' },
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT },
    );
    expect((await verifier.verify('google', jwt)).ok).toBe(false);
  });

  it('is off for a provider with no client id set, without trying to check anything', async () => {
    const off = new JoseIdTokenVerifier({ googleClientIds: [], appleClientIds: [] });
    expect(await off.verify('google', 'anything')).toEqual({
      ok: false,
      error: { tag: 'ProviderNotConfigured' },
    });
    expect(await off.verify('apple', 'anything')).toEqual({
      ok: false,
      error: { tag: 'ProviderNotConfigured' },
    });
  });
});
