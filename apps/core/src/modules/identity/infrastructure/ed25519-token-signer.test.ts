import { generateKeyPairSync } from 'node:crypto';
import { importJWK, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { Ed25519TokenSigner } from './ed25519-token-signer.js';

const claims = {
  driverId: makeId<'DriverId'>('driver-1'),
  sessionId: makeId<'SessionId'>('session-1'),
};

describe('Ed25519TokenSigner', () => {
  it('signs a token that verifies against its own published public key', async () => {
    const signer = await Ed25519TokenSigner.generateEphemeral();
    const token = await signer.signAccessToken(claims);
    const jwk = await signer.publicJwk();

    const publicKey = await importJWK(jwk, 'EdDSA');
    const { payload } = await jwtVerify(token, publicKey);
    expect(payload.sub).toBe(claims.driverId);
    expect(payload.sid).toBe(claims.sessionId);
  });

  it('carries only sub, sid, kind, iat and exp — no email, no vehicle data (design doc §9)', async () => {
    const signer = await Ed25519TokenSigner.generateEphemeral();
    const token = await signer.signAccessToken(claims);
    const jwk = await signer.publicJwk();
    const publicKey = await importJWK(jwk, 'EdDSA');

    const { payload } = await jwtVerify(token, publicKey);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'kind', 'sid', 'sub']);
    expect(payload.kind).toBe('driver');
  });

  it("signs staff tokens with the same key, marked kind 'staff' (P2-M1.6)", async () => {
    const signer = await Ed25519TokenSigner.generateEphemeral();
    const token = await signer.signStaffAccessToken({ staffId: 'staff-1', sessionId: 'sess-1' });
    const publicKey = await importJWK(await signer.publicJwk(), 'EdDSA');

    const { payload } = await jwtVerify(token, publicKey);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'kind', 'sid', 'sub']);
    expect(payload).toMatchObject({ sub: 'staff-1', sid: 'sess-1', kind: 'staff' });
  });

  it('sets a 15-minute expiry', async () => {
    const signer = await Ed25519TokenSigner.generateEphemeral();
    const token = await signer.signAccessToken(claims);
    const jwk = await signer.publicJwk();
    const publicKey = await importJWK(jwk, 'EdDSA');

    const { payload } = await jwtVerify(token, publicKey);
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15 * 60);
  });

  it('publishes a JWK with no private material', async () => {
    const signer = await Ed25519TokenSigner.generateEphemeral();
    const jwk = await signer.publicJwk();
    expect(jwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519' });
    expect(jwk).not.toHaveProperty('d'); // 'd' is the private scalar in an OKP JWK
  });

  it('two ephemeral signers use different keys: a token from one does not verify against the other', async () => {
    const signerA = await Ed25519TokenSigner.generateEphemeral();
    const signerB = await Ed25519TokenSigner.generateEphemeral();
    const token = await signerA.signAccessToken(claims);
    const publicKeyB = await importJWK(await signerB.publicJwk(), 'EdDSA');

    await expect(jwtVerify(token, publicKeyB)).rejects.toThrow();
  });

  it('fromPkcs8Pem derives the matching public key from a private-key-only PEM', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const signer = Ed25519TokenSigner.fromPkcs8Pem(pem);
    const token = await signer.signAccessToken(claims);
    const publicKey = await importJWK(await signer.publicJwk(), 'EdDSA');

    const { payload } = await jwtVerify(token, publicKey);
    expect(payload.sub).toBe(claims.driverId);
  });

  it('fromPkcs8Pem with the same PEM twice produces interoperable signers (the key round-trips)', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const signerA = Ed25519TokenSigner.fromPkcs8Pem(pem);
    const signerB = Ed25519TokenSigner.fromPkcs8Pem(pem);
    const token = await signerA.signAccessToken(claims);
    const publicKeyB = await importJWK(await signerB.publicJwk(), 'EdDSA');

    await expect(jwtVerify(token, publicKeyB)).resolves.toBeDefined();
  });
});
