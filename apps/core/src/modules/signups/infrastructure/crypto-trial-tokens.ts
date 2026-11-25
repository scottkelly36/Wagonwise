import { createHash, randomBytes } from 'node:crypto';
import type { TrialTokens } from '../application/signups.js';

/** The secret in a trial link: 32 random bytes, and only its SHA-256 is kept, like a staff invitation's. */
export class CryptoTrialTokens implements TrialTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
