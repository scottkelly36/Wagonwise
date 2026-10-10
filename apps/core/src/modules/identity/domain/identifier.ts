import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export interface InvalidIdentifier extends TaggedError<'InvalidIdentifier'> {
  readonly reason: 'not_email_or_phone';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits only, 8-15 long, an optional leading "+" (E.164-ish). Real phone-number parsing
// (country-code aware, libphonenumber-grade) is deferred to when a real SMS adapter needs it —
// this is just enough to reject obvious garbage and normalise formatting differences.
const PHONE_RE = /^\+?\d{8,15}$/;

// A UK number as people write it: 07700900123 (national, with the 0), +447700900123, 447700900123, 00447700900123, and the
// +44 (0)7700 900123 habit of keeping the 0. What is captured is the number without the 0 or the country code.
const UK_NATIONAL_RE = /^0([1-9]\d{8,9})$/;
const UK_INTERNATIONAL_RE = /^(?:\+?44|0044)0?([1-9]\d{8,9})$/;

/** The part of a UK number after the 0 or +44, or undefined when this is not one. */
function ukNumber(digitsOnly: string): string | undefined {
  return (UK_NATIONAL_RE.exec(digitsOnly) ?? UK_INTERNATIONAL_RE.exec(digitsOnly))?.[1];
}

/**
 * A driver signs in with an email or a phone number (design doc §8, sign-in screen). Normalises
 * to a stable lookup key: emails lowercased, phone numbers stripped of spaces/hyphens/brackets —
 * so "+44 7123 456789" and "+447123456789" are the same driver. A UK number is always written
 * +44…, however it was typed, so 07123 456789 and +44 7123 456789 are the same driver too: a firm that
 * invites a driver by 07… and a driver who signs in with +44… must meet.
 */
export function normalizeIdentifier(raw: string): Result<string, InvalidIdentifier> {
  const forms = identifierForms(raw);
  return forms.ok ? ok(forms.value[0]) : forms;
}

/**
 * Every way the same person may already be stored, the one to use first. A UK number was stored exactly as typed before it was
 * made consistent, so an account made as 07… must still be found when the driver types +44…, and the other way round. Anything
 * else (an email, a number outside the UK) has just the one form.
 */
export function identifierForms(
  raw: string,
): Result<readonly [string, ...string[]], InvalidIdentifier> {
  const trimmed = raw.trim();
  if (EMAIL_RE.test(trimmed)) {
    return ok([trimmed.toLowerCase()]);
  }
  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  if (PHONE_RE.test(digitsOnly)) {
    const uk = ukNumber(digitsOnly);
    return ok(uk === undefined ? [digitsOnly] : [`+44${uk}`, `0${uk}`, `44${uk}`, `0044${uk}`]);
  }
  return err({ tag: 'InvalidIdentifier', reason: 'not_email_or_phone' });
}
