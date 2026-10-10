import { describe, expect, it } from 'vitest';
import { identifierForms, normalizeIdentifier } from './identifier.js';

describe('normalizeIdentifier', () => {
  it.each([
    ['Driver@Example.com', 'driver@example.com'],
    ['  driver@example.com  ', 'driver@example.com'],
  ])('lowercases and trims a valid email: %s', (raw, expected) => {
    const result = normalizeIdentifier(raw);
    expect(result).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['+44 7123 456789', '+447123456789'],
    ['+447123456789', '+447123456789'],
    ['+44 (0)7123 456789', '+447123456789'],
  ])('strips formatting from a valid phone number: %s', (raw, expected) => {
    const result = normalizeIdentifier(raw);
    expect(result).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['neither email nor phone', 'not-an-identifier'],
    ['too short a number', '+441'],
    ['empty', ''],
    ['an email missing a domain', 'driver@'],
  ])('rejects %s', (_label, raw) => {
    const result = normalizeIdentifier(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ tag: 'InvalidIdentifier', reason: 'not_email_or_phone' });
    }
  });

  it('treats differently-formatted phone numbers as the same identifier', () => {
    const a = normalizeIdentifier('+44 7123 456789');
    const b = normalizeIdentifier('+447123456789');
    expect(a).toEqual(b);
  });
});

describe('UK numbers', () => {
  it.each([
    '07123 456789',
    '07123-456-789',
    '+44 7123 456789',
    '+447123456789',
    '447123456789',
    '00447123456789',
    '+44 (0)7123 456789',
  ])('are all the same driver, written +44…: %s', (raw) => {
    expect(normalizeIdentifier(raw)).toEqual({ ok: true, value: '+447123456789' });
  });

  it('lists every form the same person may already be stored under, the +44 one first', () => {
    expect(identifierForms('07123 456789')).toEqual({
      ok: true,
      value: ['+447123456789', '07123456789', '447123456789', '00447123456789'],
    });
  });

  it('leaves a landline alike, and a number outside the UK and an email as they are', () => {
    expect(normalizeIdentifier('0191 123 4567')).toEqual({ ok: true, value: '+441911234567' });
    expect(normalizeIdentifier('+353 87 123 4567')).toEqual({ ok: true, value: '+353871234567' });
    expect(identifierForms('+353 87 123 4567')).toEqual({ ok: true, value: ['+353871234567'] });
    expect(identifierForms('Sam@Example.com')).toEqual({ ok: true, value: ['sam@example.com'] });
  });

  it('does not take a short or odd number for a UK one', () => {
    expect(identifierForms('0123456').ok).toBe(false);
    expect(normalizeIdentifier('+4400000000000')).toEqual({ ok: true, value: '+4400000000000' });
  });
});
