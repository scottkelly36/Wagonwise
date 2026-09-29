import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStaffTokenVerifier } from './staff-token-verifier.js';

/**
 * A real HTTP server standing in for core's `/identity/.well-known/jwks.json` — this exercises
 * jose's actual `createRemoteJWKSet` fetch-and-cache machinery, not a mock of it, and proves the
 * X-Internal-Key header really is sent on the JWKS fetch (core protects that route too).
 */
describe('createStaffTokenVerifier', () => {
  let server: Server;
  let baseUrl: string;
  let receivedInternalKey: string | undefined;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let jwkResponse: object;

  beforeEach(async () => {
    const keyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateKey = keyPair.privateKey;
    jwkResponse = { keys: [await exportJWK(keyPair.publicKey)] };

    server = createServer((request, response) => {
      receivedInternalKey = request.headers['x-internal-key'] as string | undefined;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(jwkResponse));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function signToken(claims: Record<string, unknown>): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('staff-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
  }

  it('verifies a token signed with the matching key and returns its claims', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'the-internal-key');
    const token = await signToken({ sid: 'session-1', kind: 'staff' });

    const claims = await verifier.verify(token);
    expect(claims).toEqual({ staffId: 'staff-1', sessionId: 'session-1' });
  });

  it('sends X-Internal-Key on the JWKS fetch — core protects that route too', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'the-internal-key');
    await verifier.verify(await signToken({ sid: 'session-1', kind: 'staff' }));
    expect(receivedInternalKey).toBe('the-internal-key');
  });

  it('refuses a driver token, even though core signed it with the same key', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'k');
    await expect(
      verifier.verify(await signToken({ sid: 'session-1', kind: 'driver' })),
    ).rejects.toThrow('not a staff access token');
  });

  it('refuses a token with no kind: only driver tokens ever lacked one', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'k');
    await expect(verifier.verify(await signToken({ sid: 'session-1' }))).rejects.toThrow(
      'not a staff access token',
    );
  });

  it('rejects a token missing the sid claim', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'k');
    const badToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('staff-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    await expect(verifier.verify(badToken)).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const otherKeyPair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    const foreignToken = await new SignJWT({ sid: 'session-1', kind: 'staff' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('staff-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(otherKeyPair.privateKey);

    const verifier = createStaffTokenVerifier(baseUrl, 'k');
    await expect(verifier.verify(foreignToken)).rejects.toThrow();
  });

  it('rejects garbage input', async () => {
    const verifier = createStaffTokenVerifier(baseUrl, 'k');
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});
