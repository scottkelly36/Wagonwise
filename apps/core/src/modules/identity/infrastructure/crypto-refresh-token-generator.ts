import { randomBytes } from 'node:crypto';
import type { RefreshTokenGenerator } from '../application/ports/refresh-token-generator.js';

/** 256 bits from Node's CSPRNG, base64url-encoded — an opaque bearer token, not a JWT. */
export class CryptoRefreshTokenGenerator implements RefreshTokenGenerator {
  next(): string {
    return randomBytes(32).toString('base64url');
  }
}
