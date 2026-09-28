import { randomBytes, randomInt } from 'node:crypto';
import type { RandomCodes } from '../application/ports/random-codes.js';

// No 0/O, 1/I/L: recovery codes get read off paper and typed in.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class CryptoRandomCodes implements RandomCodes {
  sixDigitCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /** `XXXXX-XXXXX`: 10 characters from a 31-letter alphabet, ~49 bits each. */
  recoveryCodes(count: number): string[] {
    return Array.from({ length: count }, () => {
      const chars = Array.from(
        { length: 10 },
        () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
      );
      return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
    });
  }

  /** 32 random bytes, URL-safe: 256 bits. */
  inviteToken(): string {
    return randomBytes(32).toString('base64url');
  }

  refreshToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
