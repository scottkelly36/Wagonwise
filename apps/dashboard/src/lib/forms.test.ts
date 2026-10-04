import { describe, expect, it } from 'vitest';

import { hasErrors, identifierError, isEmail, isPhone } from './forms';

describe('isEmail', () => {
  it('accepts an ordinary address, ignoring surrounding spaces', () => {
    expect(isEmail('driver@haulage.co.uk')).toBe(true);
    expect(isEmail('  a.b+c@example.com ')).toBe(true);
  });

  it('rejects the usual slips', () => {
    for (const bad of ['', 'driver', 'driver@', '@haulage.co.uk', 'driver@haulage', 'a b@c.com']) {
      expect(isEmail(bad)).toBe(false);
    }
  });
});

describe('hasErrors', () => {
  it('is true only when a field has a message', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ email: 'Enter an email address' })).toBe(true);
  });
});

describe('isPhone', () => {
  it('accepts the formats core accepts', () => {
    for (const ok of ['07123 456789', '+44 7123 456789', '07123-456-789', '(01434) 600123']) {
      expect(isPhone(ok)).toBe(true);
    }
  });

  it('rejects letters and numbers that are too short', () => {
    for (const bad of ['', '+441', 'not a number', '0712 345 abc']) {
      expect(isPhone(bad)).toBe(false);
    }
  });
});

describe('identifierError', () => {
  it('is quiet for a good email or phone number', () => {
    expect(identifierError('driver@haulage.co.uk')).toBeUndefined();
    expect(identifierError('07700 900123')).toBeUndefined();
  });

  it('says what to do for empty, a bad email and a bad phone number', () => {
    expect(identifierError('')).toMatch(/Enter the driver/);
    expect(identifierError('driver@')).toMatch(/email address/);
    expect(identifierError('0770')).toMatch(/phone number/);
  });
});
