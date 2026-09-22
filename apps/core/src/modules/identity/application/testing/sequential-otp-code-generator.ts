import type { OtpCodeGenerator } from '../ports/otp-code-generator.js';

/** Deterministic 6-digit codes for tests: 000001, 000002, ... */
export class SequentialOtpCodeGenerator implements OtpCodeGenerator {
  #next = 1;

  next(): string {
    return String(this.#next++).padStart(6, '0');
  }
}
