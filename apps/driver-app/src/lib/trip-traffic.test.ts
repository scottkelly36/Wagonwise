import { trafficExtraMinutes, trafficNote } from './trip-traffic';

describe('trafficExtraMinutes', () => {
  it('is the delay when traffic is on, the route is well read and the delay is worth saying', () => {
    expect(
      trafficExtraMinutes({ enabled: true, extraMinutes: 12, coverage: 0.9, stretches: [] }),
    ).toBe(12);
  });

  it('is nothing when traffic is off or unknown', () => {
    expect(trafficExtraMinutes(undefined)).toBe(0);
    expect(
      trafficExtraMinutes({ enabled: false, extraMinutes: 12, coverage: 1, stretches: [] }),
    ).toBe(0);
  });

  it('is nothing when too little of the route was read, or the delay is a minute or so', () => {
    expect(
      trafficExtraMinutes({ enabled: true, extraMinutes: 12, coverage: 0.3, stretches: [] }),
    ).toBe(0);
    expect(
      trafficExtraMinutes({ enabled: true, extraMinutes: 1, coverage: 1, stretches: [] }),
    ).toBe(0);
  });
});

describe('trafficNote', () => {
  it('says how much, or nothing', () => {
    expect(trafficNote(0)).toBeUndefined();
    expect(trafficNote(12)).toBe('+12 min traffic');
  });
});
