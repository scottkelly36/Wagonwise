import { speedLimitHere, speedLimitLabel } from './speed-limit';

const zones = [
  { from: 0.1, to: 0.3, limitMph: 30 },
  { from: 0.5, to: 1 },
];

describe('speedLimitHere', () => {
  it('shows the number in a zone with one', () => {
    expect(speedLimitHere(zones, 2_000, 10_000, 0)).toEqual({ kind: 'limit', mph: 30 });
  });

  it('shows the national speed limit in a zone without a number', () => {
    expect(speedLimitHere(zones, 7_000, 10_000, 0)).toEqual({ kind: 'national' });
  });

  it('shows nothing between zones, so nothing is guessed', () => {
    expect(speedLimitHere(zones, 4_000, 10_000, 0)).toBeUndefined();
    expect(speedLimitHere(zones, 500, 10_000, 0)).toBeUndefined();
  });

  it('changes at the start of the next zone and not at the end of the last', () => {
    expect(speedLimitHere(zones, 1_000, 10_000, 0)).toEqual({ kind: 'limit', mph: 30 });
    expect(speedLimitHere(zones, 3_000, 10_000, 0)).toBeUndefined();
    expect(speedLimitHere(zones, 10_000, 10_000, 0)).toBeUndefined();
  });

  it('shows nothing when the driver has left the route', () => {
    expect(speedLimitHere(zones, 2_000, 10_000, 200)).toBeUndefined();
  });

  it('shows nothing before the limits have arrived or when there are none', () => {
    expect(speedLimitHere(undefined, 2_000, 10_000, 0)).toBeUndefined();
    expect(speedLimitHere([], 2_000, 10_000, 0)).toBeUndefined();
    expect(speedLimitHere(zones, 0, 0, 0)).toBeUndefined();
  });
});

describe('speedLimitLabel', () => {
  it('says what is shown and to check the signs', () => {
    expect(speedLimitLabel({ kind: 'limit', mph: 40 })).toBe(
      'Speed limit 40 miles per hour. Check the signs.',
    );
    expect(speedLimitLabel({ kind: 'national' })).toBe(
      'National speed limit applies. Check the signs.',
    );
  });
});
