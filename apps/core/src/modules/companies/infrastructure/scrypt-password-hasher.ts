import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../application/ports/password-hasher.js';

// OWASP's scrypt baseline (N=2^17, r=8, p=1) costs ~128 MiB per hash; this keeps its r and p with
// N=2^15 (~32 MiB, tens of milliseconds): still far too slow to brute-force offline, without a
// handful of simultaneous sign-ins exhausting a small App Platform container's memory.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function optionsFor(n: number, r: number, p: number): ScryptOptions {
  return { N: n, r, p, maxmem: 256 * n * r };
}

/**
 * Stored as `scrypt$N$r$p$salt$hash` (base64), so the cost can be raised later without breaking
 * existing hashes: `verify` reads the parameters back from each hash.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, optionsFor(N, R, P));
    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [n, r, p] = parts.slice(1, 4).map(Number);
    if (n === undefined || r === undefined || p === undefined) return false;
    if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
    const salt = Buffer.from(parts[4] ?? '', 'base64');
    const expected = Buffer.from(parts[5] ?? '', 'base64');
    if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, salt, optionsFor(n, r, p));
    return timingSafeEqual(actual, expected);
  }
}
