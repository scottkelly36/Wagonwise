import { createPrivateKey, createPublicKey, generateKeyPair, type KeyObject } from 'node:crypto';
import { promisify } from 'node:util';
import { exportJWK, SignJWT } from 'jose';
import type {
  AccessTokenClaims,
  StaffAccessTokenClaims,
  TokenSigner,
} from '../application/ports/token-signer.js';

const generateKeyPairAsync = promisify(generateKeyPair);

const ALG = 'EdDSA';
const ACCESS_TOKEN_TTL = '15m';

/**
 * Ed25519 asymmetric signing (decision 1): only this adapter ever touches the private key. A
 * BFF gets the public key from `publicJwk()` — exposed at a JWKS route — and can verify a token
 * but is physically unable to mint one.
 *
 * Uses `node:crypto` for key material (generation, PEM import, deriving a public key from a
 * private one) and `jose` for the JWT mechanics (compact serialisation, claim handling) — jose
 * accepts a Node `KeyObject` directly, so there is no need to also round-trip keys through its
 * own import functions.
 */
export class Ed25519TokenSigner implements TokenSigner {
  private constructor(
    private readonly privateKey: KeyObject,
    private readonly publicKey: KeyObject,
  ) {}

  /**
   * For local dev only: a fresh key every boot means every restart invalidates every existing
   * session. Use `fromPkcs8Pem` (config's `IDENTITY_PRIVATE_KEY`) for anything meant to stay up.
   */
  static async generateEphemeral(): Promise<Ed25519TokenSigner> {
    const { privateKey, publicKey } = await generateKeyPairAsync('ed25519');
    return new Ed25519TokenSigner(privateKey, publicKey);
  }

  /**
   * PKCS8 PEM in, as validated by config.ts. Ed25519's public key is deterministically derivable
   * from its private key, so only the private half needs configuring — one secret, not two.
   */
  static fromPkcs8Pem(pem: string): Ed25519TokenSigner {
    const privateKey = createPrivateKey(pem);
    const publicKey = createPublicKey(privateKey);
    return new Ed25519TokenSigner(privateKey, publicKey);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    // Claims limited to sub and sid (design doc §9) — no email, no vehicle data.
    // `kind` (P2-M1.6) keeps driver and staff tokens apart even though one key signs both.
    return new SignJWT({ sid: claims.sessionId, kind: 'driver' })
      .setProtectedHeader({ alg: ALG })
      .setSubject(claims.driverId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(this.privateKey);
  }

  async signStaffAccessToken(claims: StaffAccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, kind: 'staff' })
      .setProtectedHeader({ alg: ALG })
      .setSubject(claims.staffId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(this.privateKey);
  }

  publicJwk(): Promise<Record<string, unknown>> {
    return exportJWK(this.publicKey);
  }
}
