import { CONSENT_VERSION, needsConsent } from './consent-version';

describe('needsConsent', () => {
  it('is due for a driver who has never accepted', () => {
    expect(needsConsent({})).toBe(true);
    expect(needsConsent({ consentVersion: CONSENT_VERSION })).toBe(true);
  });

  it('is due once for a driver who accepted before versions existed', () => {
    expect(needsConsent({ consentedAt: '2026-10-01T09:00:00.000Z' })).toBe(true);
  });

  it('is due for a driver who accepted an older version', () => {
    expect(
      needsConsent({ consentedAt: '2026-10-01T09:00:00.000Z', consentVersion: '2026-01-01' }),
    ).toBe(true);
  });

  it('is not due once the current version is accepted', () => {
    expect(
      needsConsent({ consentedAt: '2026-11-05T09:00:00.000Z', consentVersion: CONSENT_VERSION }),
    ).toBe(false);
  });
});
