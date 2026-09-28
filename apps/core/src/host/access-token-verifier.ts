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
      // P2-M1.6: one key signs both driver and staff tokens, so a driver route must refuse a
      // staff token by its `kind`. Driver tokens issued before `kind` existed (at most 15
      // minutes' worth after the deploy that added it) carry none, and are still drivers'.
      if (payload.kind !== undefined && payload.kind !== 'driver') {
        throw new Error('not a driver access token');
      }
      return { driverId: payload.sub, sessionId: payload.sid };
    },
  };
}

export interface StaffAccessTokenClaims {
  readonly staffId: string;
  readonly sessionId: string;
}

export interface StaffAccessTokenVerifier {
  /** Throws unless the token is a valid, unexpired staff token (`kind: 'staff'`). */
  verify(token: string): Promise<StaffAccessTokenClaims>;
}

/** The staff counterpart: same key, but only `kind: 'staff'` passes. Strict, with no legacy
 *  allowance: staff tokens have carried `kind` from the start. */
export async function createLocalStaffAccessTokenVerifier(
  publicJwk: Record<string, unknown>,
): Promise<StaffAccessTokenVerifier> {
  const key = await importJWK(publicJwk, 'EdDSA');
  return {
    async verify(token: string): Promise<StaffAccessTokenClaims> {
      const { payload } = await jwtVerify(token, key, { algorithms: ['EdDSA'] });
      if (payload.kind !== 'staff') throw new Error('not a staff access token');
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('access token is missing its sub or sid claim');
      }
      return { staffId: payload.sub, sessionId: payload.sid };
    },
  };
}
