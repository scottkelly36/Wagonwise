import { describe, expect, it } from 'vitest';
import { warningsGeoJson, warningTitle, worstLevel } from './weather';

const area = { type: 'MultiPolygon' as const, coordinates: [] };

function warning(id: string, level: 'yellow' | 'amber' | 'red', kinds: ('wind' | 'rain')[]) {
  return {
    id,
    level,
    kinds,
    headline: id,
    validFrom: '2026-10-10T06:00:00.000Z',
    validTo: '2026-10-10T18:00:00.000Z',
    areas: [],
    area,
  };
}

describe('warningTitle', () => {
  it('names the level and what it is for', () => {
    expect(warningTitle({ level: 'amber', kinds: ['wind'] })).toBe('Amber wind');
    expect(warningTitle({ level: 'yellow', kinds: ['rain', 'wind'] })).toBe('Yellow rain and wind');
    expect(warningTitle({ level: 'red', kinds: [] })).toBe('Red weather');
  });
});

describe('worstLevel', () => {
  it('is the most severe, or nothing', () => {
    expect(worstLevel([])).toBeUndefined();
    expect(worstLevel([{ level: 'yellow' }, { level: 'red' }, { level: 'amber' }])).toBe('red');
  });
});

describe('warningsGeoJson', () => {
  it('puts the least severe first so the worst is drawn on top', () => {
    const json = warningsGeoJson([
      warning('r', 'red', ['wind']),
      warning('y', 'yellow', ['rain']),
      warning('a', 'amber', ['wind']),
    ]);
    expect(json.features.map((f) => f.properties.id)).toEqual(['y', 'a', 'r']);
    expect(json.features[2]?.properties.colour).toBe('#d4261c');
  });
});
