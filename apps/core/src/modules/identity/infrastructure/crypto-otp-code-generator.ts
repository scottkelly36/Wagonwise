import { randomInt } from 'node:crypto';
import type { OtpCodeGenerator } from '../application/ports/otp-code-generator.js';

/** A 6-digit code from Node's CSPRNG (`randomInt` avoids the modulo bias `Math.random()` has). */
export class CryptoOtpCodeGenerator implements OtpCodeGenerator {
  next(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }
}
