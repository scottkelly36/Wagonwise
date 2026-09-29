import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface StaffTokenClaims {
  readonly staffId: string;
  readonly sessionId: string;
}

export interface StaffTokenVerifier {
  /** Throws unless the token is a valid, unexpired staff token (`kind: 'staff'`). */
  verify(token: string): Promise<StaffTokenClaims>;
}

/**
 * Verifies against core's public key, fetched from its JWKS route (with `X-Internal-Key`, as
 * core protects that route too) and cached by jose. This BFF can check a token but never make
 * one. Only `kind: 'staff'` passes: a driver token, signed with the same key, is refused
 * (P2-M1.6), with no legacy allowance, since staff tokens have carried `kind` from the start.
 */
export function createStaffTokenVerifier(
  coreInternalUrl: string,
  coreInternalKey: string,
): StaffTokenVerifier {
  const jwks = createRemoteJWKSet(new URL('/identity/.well-known/jwks.json', coreInternalUrl), {
    headers: { 'x-internal-key': coreInternalKey },
  });

  return {
    async verify(token: string): Promise<StaffTokenClaims> {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'] });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('access token is missing its sub or sid claim');
      }
      if (payload.kind !== 'staff') throw new Error('not a staff access token');
      return { staffId: payload.sub, sessionId: payload.sid };
    },
  };
}
