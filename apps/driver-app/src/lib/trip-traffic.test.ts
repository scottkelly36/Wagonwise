import { trafficExtraMinutes, trafficNote, worthAsking } from './trip-traffic';

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

describe('worthAsking', () => {
  const here = { lat: 54.97, lon: -1.6 };

  it('asks the first time, and again once the lorry has moved on a kilometre', () => {
    expect(worthAsking(undefined, here)).toBe(true);
    // About 1.1 km north.
    expect(worthAsking(here, { lat: 54.98, lon: -1.6 })).toBe(true);
  });

  it('does not ask while the lorry has hardly moved: a stop, or a queue', () => {
    expect(worthAsking(here, here)).toBe(false);
    // About 220 m.
    expect(worthAsking(here, { lat: 54.972, lon: -1.6 })).toBe(false);
  });
});
