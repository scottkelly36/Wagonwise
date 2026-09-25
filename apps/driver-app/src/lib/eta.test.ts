import { computeEta } from './eta';

describe('computeEta', () => {
  it('adds the duration (minutes) to the departure time', () => {
    const leaveAt = new Date('2026-06-15T08:00:00.000Z');
    expect(computeEta(leaveAt, 90).toISOString()).toBe('2026-06-15T09:30:00.000Z');
  });

  it('handles a fractional duration by rounding down to the second', () => {
    const leaveAt = new Date('2026-06-15T08:00:00.000Z');
    expect(computeEta(leaveAt, 1.5).toISOString()).toBe('2026-06-15T08:01:30.000Z');
  });

  it('does not mutate the leaveAt it was given', () => {
    const leaveAt = new Date('2026-06-15T08:00:00.000Z');
    const before = leaveAt.getTime();
    computeEta(leaveAt, 45);
    expect(leaveAt.getTime()).toBe(before);
  });
});
