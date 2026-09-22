import { describe, expect, it } from 'vitest';
import { CryptoRefreshTokenGenerator } from './crypto-refresh-token-generator.js';

describe('CryptoRefreshTokenGenerator', () => {
  it('produces a base64url string with no padding or URL-unsafe characters', () => {
    const generator = new CryptoRefreshTokenGenerator();
    const token = generator.next();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(32); // 256 bits base64url-encoded, unpadded
  });

  it('never repeats across many calls', () => {
    const generator = new CryptoRefreshTokenGenerator();
    const tokens = new Set(Array.from({ length: 200 }, () => generator.next()));
    expect(tokens.size).toBe(200);
  });
});
