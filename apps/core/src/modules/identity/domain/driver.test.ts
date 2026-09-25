import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { anonymize, consent, isDeleted, type Driver } from './driver.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('11111111-1111-4111-8111-111111111111'),
    identifier: 'driver1@example.com',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('consent', () => {
  it('sets consentedAt, leaving everything else unchanged', () => {
    const d = driver();
    expect(consent(d, now)).toEqual({ ...d, consentedAt: now });
  });
});

describe('anonymize', () => {
  it('replaces identifier with a placeholder derived from the id and sets deletedAt', () => {
    const d = driver();
    const anonymized = anonymize(d, now);
    expect(anonymized.identifier).toBe(`deleted:${d.id}`);
    expect(anonymized.deletedAt).toEqual(now);
    expect(anonymized.id).toBe(d.id);
    expect(anonymized.createdAt).toEqual(d.createdAt);
  });

  it('is safe to call again on an already-anonymized driver', () => {
    const once = anonymize(driver(), now);
    const twice = anonymize(once, new Date('2026-06-16T00:00:00.000Z'));
    expect(twice.identifier).toBe(once.identifier);
  });
});

describe('isDeleted', () => {
  it('is false until anonymize() has run', () => {
    expect(isDeleted(driver())).toBe(false);
  });

  it('is true once deletedAt is set', () => {
    expect(isDeleted(anonymize(driver(), now))).toBe(true);
  });
});
