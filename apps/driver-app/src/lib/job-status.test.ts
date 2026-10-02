import { matchesJobStatusTrigger } from './job-status';

describe('matchesJobStatusTrigger', () => {
  it('matches a natural phrase for the current status', () => {
    expect(matchesJobStatusTrigger('loaded and leaving', 'loaded')).toBe(true);
    expect(matchesJobStatusTrigger("I've just arrived at the pickup", 'accepted')).toBe(true);
    expect(matchesJobStatusTrigger('delivered it', 'at_delivery')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesJobStatusTrigger('LOADED', 'at_pickup')).toBe(true);
  });

  it('does not match on an unrelated word boundary', () => {
    // "unloaded" must not match "loaded" as a substring.
    expect(matchesJobStatusTrigger('the trailer got unloaded by mistake', 'at_pickup')).toBe(false);
  });

  it('does not match a phrase for a different status', () => {
    expect(matchesJobStatusTrigger('delivered it', 'loaded')).toBe(false);
  });

  it('returns false for a status with no next step', () => {
    expect(matchesJobStatusTrigger('loaded and leaving', 'delivered')).toBe(false);
    expect(matchesJobStatusTrigger('loaded and leaving', 'draft')).toBe(false);
  });

  it('returns false for an unrelated transcript', () => {
    expect(matchesJobStatusTrigger('turn the radio up', 'loaded')).toBe(false);
  });
});
