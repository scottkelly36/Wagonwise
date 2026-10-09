import { describe, expect, it } from 'vitest';
import { normaliseRegistration, validateRegistration } from './vehicle.js';

describe('normaliseRegistration', () => {
  it('puts a registration in capitals and takes out spaces, dashes and dots', () => {
    expect(normaliseRegistration('ab12 cde')).toBe('AB12CDE');
    expect(normaliseRegistration(' ab-12.cde ')).toBe('AB12CDE');
  });
});

describe('validateRegistration', () => {
  it('keeps a tidy registration', () => {
    expect(validateRegistration('ab12 cde')).toEqual({ ok: true, value: 'AB12CDE' });
    expect(validateRegistration('A1')).toEqual({ ok: true, value: 'A1' });
    expect(validateRegistration('PERSONAL1')).toEqual({
      ok: false,
      error: { tag: 'InvalidRegistration', reason: 'too_long' },
    });
  });

  it('treats none, or only spaces, as no registration', () => {
    expect(validateRegistration(undefined)).toEqual({ ok: true, value: undefined });
    expect(validateRegistration('')).toEqual({ ok: true, value: undefined });
    expect(validateRegistration('   ')).toEqual({ ok: true, value: undefined });
  });

  it('refuses a single character, more than eight, and anything but letters and digits', () => {
    expect(validateRegistration('A')).toEqual({
      ok: false,
      error: { tag: 'InvalidRegistration', reason: 'too_short' },
    });
    expect(validateRegistration('ABCDEFGHI')).toEqual({
      ok: false,
      error: { tag: 'InvalidRegistration', reason: 'too_long' },
    });
    expect(validateRegistration('AB12 C!E')).toEqual({
      ok: false,
      error: { tag: 'InvalidRegistration', reason: 'bad_characters' },
    });
  });
});
