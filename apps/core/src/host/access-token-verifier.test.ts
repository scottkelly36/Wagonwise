import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createLocalAccessTokenVerifier,
  createLocalStaffAccessTokenVerifier,
} from './access-token-verifier.js';

describe('createLocalAccessTokenVerifier', () => {
  async function signToken(
    privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'],
    claims: Record<string, unknown>,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('driver-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
  }

  it('verifies a token signed with the matching key and returns its claims — no network involved', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const verifier = await createLocalAccessTokenVerifier(await exportJWK(publicKey));
    const token = await signToken(privateKey, { sid: 'session-1' });

    const claims = await verifier.verify(token);
    expect(claims).toEqual({ driverId: 'driver-1', sessionId: 'session-1' });
  });

  it('rejects a token missing the sid claim', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const verifier = await createLocalAccessTokenVerifier(await exportJWK(publicKey));
    const badToken = await signToken(privateKey, {});

    await expect(verifier.verify(badToken)).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const otherKeyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const foreignToken = await signToken(otherKeyPair.privateKey, { sid: 'session-1' });

    const verifier = await createLocalAccessTokenVerifier(await exportJWK(publicKey));
    await expect(verifier.verify(foreignToken)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const verifier = await createLocalAccessTokenVerifier(await exportJWK(publicKey));
    const expiredToken = await new SignJWT({ sid: 'session-1' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('driver-1')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(privateKey);

    await expect(verifier.verify(expiredToken)).rejects.toThrow();
  });

  it('rejects garbage input', async () => {
    const { publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const verifier = await createLocalAccessTokenVerifier(await exportJWK(publicKey));
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});

describe('driver and staff tokens are kept apart by their kind claim', () => {
  async function setup() {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'EdDSA' })
        .setSubject('someone-1')
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(privateKey);
    return {
      sign,
      driver: await createLocalAccessTokenVerifier(jwk),
      staff: await createLocalStaffAccessTokenVerifier(jwk),
    };
  }

  it('driver routes accept driver tokens, and older tokens with no kind', async () => {
    const { sign, driver } = await setup();
    await expect(driver.verify(await sign({ sid: 's', kind: 'driver' }))).resolves.toEqual({
      driverId: 'someone-1',
      sessionId: 's',
    });
    await expect(driver.verify(await sign({ sid: 's' }))).resolves.toBeDefined();
  });

  it('driver routes refuse staff tokens and unknown kinds', async () => {
    const { sign, driver } = await setup();
    await expect(driver.verify(await sign({ sid: 's', kind: 'staff' }))).rejects.toThrow();
    await expect(driver.verify(await sign({ sid: 's', kind: 'admin' }))).rejects.toThrow();
  });

  it('staff routes accept only staff tokens, never a driver token or one with no kind', async () => {
    const { sign, staff } = await setup();
    await expect(staff.verify(await sign({ sid: 's', kind: 'staff' }))).resolves.toEqual({
      staffId: 'someone-1',
      sessionId: 's',
    });
    await expect(staff.verify(await sign({ sid: 's', kind: 'driver' }))).rejects.toThrow();
    await expect(staff.verify(await sign({ sid: 's' }))).rejects.toThrow();
  });
});
