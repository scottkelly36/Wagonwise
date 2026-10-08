import { jobHasPickup, jobStatusLabel, matchesJobStatusTrigger, nextStepFor } from './job-status';

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

describe('a job with no pickup', () => {
  const pickup = { kind: 'pickup', name: 'Quarry', location: { lat: 54, lon: -2 } };
  const delivery = { kind: 'delivery', name: 'Depot', location: { lat: 55, lon: -2 } };
  const withPickup = { status: 'accepted', stops: [pickup, delivery] } as unknown as Parameters<
    typeof nextStepFor
  >[0];
  const without = { status: 'accepted', stops: [delivery] } as unknown as Parameters<
    typeof nextStepFor
  >[0];

  it('goes from accepted straight to loaded', () => {
    expect(nextStepFor(without)).toEqual({ to: 'loaded', label: 'Loaded and ready' });
    expect(nextStepFor(withPickup)).toEqual({ to: 'at_pickup', label: 'Arrived at pickup' });
  });

  it('says it is accepted and not loaded yet', () => {
    expect(jobStatusLabel(without)).toBe('Accepted, not loaded yet');
    expect(jobStatusLabel(withPickup)).toBe('Accepted');
    expect(jobHasPickup(without)).toBe(false);
  });

  it('hears "loaded" or "ready" as the step from accepted', () => {
    expect(matchesJobStatusTrigger('loaded and ready', 'accepted', false)).toBe(true);
    expect(matchesJobStatusTrigger('arrived at the pickup', 'accepted', false)).toBe(false);
  });
});
