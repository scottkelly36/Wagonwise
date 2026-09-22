import { describe, expect, it } from 'vitest';
import { normalizeIdentifier } from './identifier.js';

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
    ['07123-456-789', '07123456789'],
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
