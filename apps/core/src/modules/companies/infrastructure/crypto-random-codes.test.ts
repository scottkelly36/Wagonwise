import { describe, expect, it } from 'vitest';
import { CryptoRandomCodes } from './crypto-random-codes.js';

describe('CryptoRandomCodes', () => {
  const codes = new CryptoRandomCodes();

  it('makes 6-digit codes, zero-padded', () => {
    for (let i = 0; i < 200; i += 1) expect(codes.sixDigitCode()).toMatch(/^\d{6}$/);
  });

  it('makes distinct, easy-to-type recovery codes', () => {
    const set = codes.recoveryCodes(10);
    expect(set).toHaveLength(10);
    expect(new Set(set).size).toBe(10);
    for (const code of set) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it('makes long, URL-safe invite tokens', () => {
    const token = codes.inviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codes.inviteToken()).not.toBe(token);
  });
});
