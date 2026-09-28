import type { DriverId } from '../../domain/driver.js';
import type { SessionId } from '../../domain/session.js';

/**
 * Claims limited to `sub` (driverId) and `sid` (sessionId) — no email, no vehicle data (design
 * doc §9). `iat`/`exp` are the signer's concern, not the caller's: it decides the access token's
 * lifetime (15 minutes), not the use case.
 */
export interface AccessTokenClaims {
  readonly driverId: DriverId;
  readonly sessionId: SessionId;
}

/**
 * Ed25519 asymmetric signing (decision 1): core holds the private key and is the only thing that
 * can mint a token; a BFF gets the public key from `publicJwk()` (exposed at a JWKS route) and
 * can only verify. Real implementation: infrastructure/ed25519-token-signer.ts.
 */
/** A dashboard staff member's session (P2-M1.6). Plain strings: identity signs staff tokens with
 *  the same key so every BFF verifies them the same way, but knows nothing else about staff. */
export interface StaffAccessTokenClaims {
  readonly staffId: string;
  readonly sessionId: string;
}

export interface TokenSigner {
  /** `kind: 'driver'`. Driver routes accept only these. */
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  /** `kind: 'staff'`. Staff routes accept only these, and driver routes refuse them. */
  signStaffAccessToken(claims: StaffAccessTokenClaims): Promise<string>;
  /** The public key as a JWK — never the private key. For a JWKS endpoint. */
  publicJwk(): Promise<Record<string, unknown>>;
}
