import { describe, expect, it } from 'vitest';
import {
  areaContains,
  bySeverity,
  isCurrentOrUpcoming,
  type MultiPolygon,
  type WeatherWarning,
} from './warning.js';

const square: MultiPolygon = [
  [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
];

function warning(over: Partial<WeatherWarning>): WeatherWarning {
  return {
    id: 'w',
    level: 'yellow',
    kinds: ['wind'],
    headline: 'h',
    details: undefined,
    validFrom: new Date('2026-10-10T00:00:00Z'),
    validTo: new Date('2026-10-11T00:00:00Z'),
    areas: [],
    area: square,
    ...over,
  };
}

describe('areaContains', () => {
  it('is true inside the outline and false outside', () => {
    expect(areaContains(square, { lon: 2, lat: 2 })).toBe(true);
    expect(areaContains(square, { lon: 12, lat: 2 })).toBe(false);
  });

  it('is false inside a hole', () => {
    expect(areaContains(square, { lon: 5, lat: 5 })).toBe(false);
  });

  it('is false for an empty area', () => {
    expect(areaContains([], { lon: 1, lat: 1 })).toBe(false);
  });
});

describe('isCurrentOrUpcoming', () => {
  const w = warning({});

  it('includes one in force and one starting within a day', () => {
    expect(isCurrentOrUpcoming(w, new Date('2026-10-10T12:00:00Z'))).toBe(true);
    expect(isCurrentOrUpcoming(w, new Date('2026-10-09T06:00:00Z'))).toBe(true);
  });

  it('leaves out one further ahead and one that has ended', () => {
    expect(isCurrentOrUpcoming(w, new Date('2026-10-08T12:00:00Z'))).toBe(false);
    expect(isCurrentOrUpcoming(w, new Date('2026-10-11T00:00:01Z'))).toBe(false);
  });
});

describe('bySeverity', () => {
  it('puts red first, then the sooner start', () => {
    const list = [
      warning({ id: 'y' }),
      warning({ id: 'r', level: 'red' }),
      warning({ id: 'a2', level: 'amber', validFrom: new Date('2026-10-10T06:00:00Z') }),
      warning({ id: 'a1', level: 'amber' }),
    ].sort(bySeverity);
    expect(list.map((x) => x.id)).toEqual(['r', 'a1', 'a2', 'y']);
  });
});
