import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  afterRightPassword,
  afterWrongPassword,
  emailIdentifier,
  isLockedOut,
  MAX_FAILED_PASSWORDS,
  newCredential,
  PASSWORD_LOCKOUT_MS,
  validatePassword,
} from './password.js';

const now = new Date('2026-11-01T09:00:00.000Z');
const driverId = makeId<'DriverId'>('driver-1');

describe('validatePassword', () => {
  it('accepts a long enough password with no other rules', () => {
    expect(validatePassword('correct horse', 'a@b.co')).toEqual({ ok: true, value: undefined });
    expect(validatePassword('aaaaaaaaaa', 'a@b.co').ok).toBe(true);
  });

  it('refuses one that is too short, too long, or is the email itself', () => {
    expect(validatePassword('short', 'a@b.co')).toEqual({
      ok: false,
      error: { tag: 'PasswordTooShort' },
    });
    expect(validatePassword('x'.repeat(129), 'a@b.co')).toEqual({
      ok: false,
      error: { tag: 'PasswordTooLong' },
    });
    expect(validatePassword('  Sam@Example.com ', 'sam@example.com')).toEqual({
      ok: false,
      error: { tag: 'PasswordIsEmail' },
    });
  });

  it('counts characters, not UTF-16 units, so an emoji is one', () => {
    expect(validatePassword('🙂'.repeat(9), 'a@b.co').ok).toBe(false);
    expect(validatePassword('🙂'.repeat(10), 'a@b.co').ok).toBe(true);
  });
});

describe('emailIdentifier', () => {
  it('tidies an email and refuses a phone number or garbage', () => {
    expect(emailIdentifier('  Sam@Example.COM ')).toEqual({ ok: true, value: 'sam@example.com' });
    expect(emailIdentifier('07700900123')).toEqual({ ok: false, error: { tag: 'EmailRequired' } });
    expect(emailIdentifier('nonsense').ok).toBe(false);
  });
});

describe('the lockout', () => {
  it('locks after five wrong passwords in a row, for fifteen minutes, then clears', () => {
    let credential = newCredential(driverId, 'hash', now);
    for (let i = 1; i < MAX_FAILED_PASSWORDS; i++) {
      credential = afterWrongPassword(credential, now);
      expect(isLockedOut(credential, now)).toBe(false);
    }
    credential = afterWrongPassword(credential, now);
    expect(isLockedOut(credential, now)).toBe(true);
    expect(credential.failedAttempts).toBe(0);
    expect(isLockedOut(credential, new Date(now.getTime() + PASSWORD_LOCKOUT_MS - 1))).toBe(true);
    expect(isLockedOut(credential, new Date(now.getTime() + PASSWORD_LOCKOUT_MS))).toBe(false);
  });

  it('a right password clears the count', () => {
    const wrong = afterWrongPassword(newCredential(driverId, 'hash', now), now);
    expect(wrong.failedAttempts).toBe(1);
    expect(afterRightPassword(wrong, now).failedAttempts).toBe(0);
  });
});
