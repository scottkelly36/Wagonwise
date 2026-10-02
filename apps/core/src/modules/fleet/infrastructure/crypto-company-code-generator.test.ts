import { describe, expect, it } from 'vitest';
import { CryptoCompanyCodeGenerator } from './crypto-company-code-generator.js';

describe('CryptoCompanyCodeGenerator', () => {
  it('produces an 8-character code from the unambiguous alphabet', () => {
    const generator = new CryptoCompanyCodeGenerator();
    for (let i = 0; i < 50; i++) {
      const code = generator.generate();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('does not produce the same code every time', () => {
    const generator = new CryptoCompanyCodeGenerator();
    const codes = new Set(Array.from({ length: 20 }, () => generator.generate()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
