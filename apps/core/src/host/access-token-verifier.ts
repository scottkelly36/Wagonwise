import { importJWK, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  readonly driverId: string;
  readonly sessionId: string;
}

export interface AccessTokenVerifier {
  /** Throws if the token is malformed, badly signed, expired, or missing a claim. */
  verify(token: string): Promise<AccessTokenClaims>;
}

/**
 * Core verifies its own tokens locally. Unlike the BFF's `createAccessTokenVerifier`
 * (apps/driver-bff/src/auth), which has no key and fetches one from core's own JWKS endpoint,
 * core already holds the exact key pair that signed the token (decision 1) — no HTTP round trip,
 * just the same public JWK `identity`'s `TokenSigner.publicJwk()` already exposes there, imported
 * directly.
 *
 * Takes the JWK itself, not a `TokenSigner`, so `host/` never imports anything from
 * `modules/identity/` — `build-app.ts`'s own doc comment: host "knows nothing about bounded
 * contexts."
 */
export async function createLocalAccessTokenVerifier(
  publicJwk: Record<string, unknown>,
): Promise<AccessTokenVerifier> {
  const key = await importJWK(publicJwk, 'EdDSA');
  return {
    async verify(token: string): Promise<AccessTokenClaims> {
      const { payload } = await jwtVerify(token, key, { algorithms: ['EdDSA'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('access token is missing its sub or sid claim');
      }
      return { driverId: payload.sub, sessionId: payload.sid };
    },
  };
}
