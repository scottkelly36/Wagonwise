import { createHash } from 'node:crypto';

/**
 * sha256 hex digest, used to hash OTP codes and refresh tokens before they touch storage — never
 * the raw value (design doc §9: "the refresh token hashed, never raw"; same principle for OTPs).
 *
 * Not a port: this is a pure, deterministic computation, not an external or non-deterministic
 * concern like `Clock` or `IdGenerator`, so it needs no fake to be testable. `application/` (as
 * opposed to `domain/`) is allowed a node builtin for exactly this kind of case.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
