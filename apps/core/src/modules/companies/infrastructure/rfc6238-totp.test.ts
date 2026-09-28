import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, Rfc6238Totp } from './rfc6238-totp.js';

// RFC 6238 Appendix B, SHA-1 column: the shared secret is the ASCII string below, codes are 8
// digits, 30-second steps.
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('hotp (RFC 6238 test vectors)', () => {
  it.each(RFC_VECTORS)('at t=%i gives %s', (seconds, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
  });
});

describe('base32', () => {
  it('round-trips and matches the RFC 4648 example', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('Rfc6238Totp', () => {
  const totp = new Rfc6238Totp();
  const secret = base32Encode(RFC_SECRET);
  const at = (seconds: number) => new Date(seconds * 1000);
  // The 6-digit code is the last 6 digits of the 8-digit RFC value.
  const codeAt59 = '287082';

  it('accepts the current code', () => {
    expect(totp.verify(secret, codeAt59, at(59))).toBe(true);
  });

  it('accepts the code from one step either side, and no further', () => {
    expect(totp.verify(secret, codeAt59, at(59 + 30))).toBe(true);
    expect(totp.verify(secret, codeAt59, at(59 + 60))).toBe(false);
  });

  it('rejects wrong or malformed codes', () => {
    expect(totp.verify(secret, '000000', at(59))).toBe(false);
    expect(totp.verify(secret, '28708', at(59))).toBe(false);
    expect(totp.verify(secret, 'abcdef', at(59))).toBe(false);
  });

  it('generates a 160-bit base32 secret that verifies its own codes', () => {
    const fresh = totp.generateSecret();
    expect(fresh).toMatch(/^[A-Z2-7]{32}$/);
    const now = new Date('2026-09-28T12:00:00Z');
    const code = hotp(base32Decode(fresh), Math.floor(now.getTime() / 30000), 6);
    expect(totp.verify(fresh, code, now)).toBe(true);
  });

  it('builds an otpauth URI authenticator apps understand', () => {
    const uri = totp.provisioningUri('JBSWY3DPEHPK3PXP', 'office@acme.example');
    expect(uri.startsWith('otpauth://totp/WagonWise%3Aoffice%40acme.example?')).toBe(true);
    const params = new URL(uri).searchParams;
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(params.get('issuer')).toBe('WagonWise');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
  });
});
