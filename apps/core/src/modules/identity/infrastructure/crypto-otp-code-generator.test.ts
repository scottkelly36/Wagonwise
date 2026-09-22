import { describe, expect, it } from 'vitest';
import { CryptoOtpCodeGenerator } from './crypto-otp-code-generator.js';

describe('CryptoOtpCodeGenerator', () => {
  it('produces a 6-digit, zero-padded numeric string', () => {
    const generator = new CryptoOtpCodeGenerator();
    for (let i = 0; i < 50; i++) {
      const code = generator.next();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('does not produce the same code every time', () => {
    const generator = new CryptoOtpCodeGenerator();
    const codes = new Set(Array.from({ length: 20 }, () => generator.next()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
