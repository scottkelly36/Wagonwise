import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Totp } from '../application/ports/totp.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits, RFC 4226's recommended length for HMAC-SHA1.
// One step either side: a code stays valid for up to ~90 seconds, covering a phone clock that's
// a little out and the time it takes to type.
const DRIFT_STEPS = 1;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP with HMAC-SHA1, truncated to `digits`. Exported for the RFC test vectors. */
export function hotp(secret: Buffer, counter: number, digits: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(message).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * RFC 6238 TOTP, hand-rolled (decision 6: small, well-specified, and pinned by the RFC's own test
 * vectors) rather than a dependency. SHA-1, 6 digits, 30 s: what every authenticator app
 * (Google, Microsoft, Authy, 1Password) supports by default.
 */
export class Rfc6238Totp implements Totp {
  constructor(private readonly issuer = 'WagonWise') {}

  generateSecret(): string {
    return base32Encode(randomBytes(SECRET_BYTES));
  }

  provisioningUri(secret: string, account: string): string {
    const label = encodeURIComponent(`${this.issuer}:${account}`);
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      algorithm: 'SHA1',
      digits: String(DIGITS),
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  verify(secret: string, code: string, now: Date): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const key = base32Decode(secret);
    const counter = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
    let matched = false;
    // Check every step in the window (no early return) so timing doesn't reveal which matched.
    for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift += 1) {
      const expected = Buffer.from(hotp(key, counter + drift, DIGITS));
      if (timingSafeEqual(expected, Buffer.from(code))) matched = true;
    }
    return matched;
  }
}
