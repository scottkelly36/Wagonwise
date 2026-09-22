import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export interface InvalidIdentifier extends TaggedError<'InvalidIdentifier'> {
  readonly reason: 'not_email_or_phone';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits only, 8-15 long, an optional leading "+" (E.164-ish). Real phone-number parsing
// (country-code aware, libphonenumber-grade) is deferred to when a real SMS adapter needs it —
// this is just enough to reject obvious garbage and normalise formatting differences.
const PHONE_RE = /^\+?\d{8,15}$/;

/**
 * A driver signs in with an email or a phone number (design doc §8, sign-in screen). Normalises
 * to a stable lookup key: emails lowercased, phone numbers stripped of spaces/hyphens/brackets —
 * so "+44 7123 456789" and "+447123456789" are the same driver.
 */
export function normalizeIdentifier(raw: string): Result<string, InvalidIdentifier> {
  const trimmed = raw.trim();
  if (EMAIL_RE.test(trimmed)) {
    return ok(trimmed.toLowerCase());
  }
  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  if (PHONE_RE.test(digitsOnly)) {
    return ok(digitsOnly);
  }
  return err({ tag: 'InvalidIdentifier', reason: 'not_email_or_phone' });
}
