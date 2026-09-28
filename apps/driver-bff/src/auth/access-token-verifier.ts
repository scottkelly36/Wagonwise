import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  readonly driverId: string;
  readonly sessionId: string;
}

export interface AccessTokenVerifier {
  /** Throws if the token is malformed, badly signed, expired, or missing a claim. */
  verify(token: string): Promise<AccessTokenClaims>;
}

/**
 * The BFF can verify an access token; it cannot mint one (decision 1) — there is no signing key
 * here, only jose's `createRemoteJWKSet`, which fetches core's public key, caches it, and
 * refetches on a cache miss (e.g. after core rotates its key). `X-Internal-Key` goes on the JWKS
 * fetch too — core protects that route the same as every other one except `/health`.
 */
export function createAccessTokenVerifier(
  coreInternalUrl: string,
  coreInternalKey: string,
): AccessTokenVerifier {
  const jwks = createRemoteJWKSet(new URL('/identity/.well-known/jwks.json', coreInternalUrl), {
    headers: { 'x-internal-key': coreInternalKey },
  });

  return {
    async verify(token: string): Promise<AccessTokenClaims> {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('access token is missing its sub or sid claim');
      }
      // Core signs staff tokens with the same key (P2-M1), so a staff token would otherwise pass
      // here. Tokens with no `kind` predate it and are driver tokens (15-minute lifetime).
      if (payload.kind !== undefined && payload.kind !== 'driver') {
        throw new Error('not a driver access token');
      }
      return { driverId: payload.sub, sessionId: payload.sid };
    },
  };
}
