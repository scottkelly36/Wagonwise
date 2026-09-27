import { describe, expect, it } from 'vitest';
import { CryptoInviteCodeGenerator } from './crypto-invite-code-generator.js';

describe('CryptoInviteCodeGenerator', () => {
  it('produces an 8-character code from the unambiguous alphabet', () => {
    const generator = new CryptoInviteCodeGenerator();
    for (let i = 0; i < 50; i++) {
      const code = generator.next();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it('does not produce the same code every time', () => {
    const generator = new CryptoInviteCodeGenerator();
    const codes = new Set(Array.from({ length: 20 }, () => generator.next()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
