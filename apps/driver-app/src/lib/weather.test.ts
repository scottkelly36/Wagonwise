import type { WeatherWarningDto } from '@wagonwise/contracts/weather';

import { headlineWarning, roundedForWeather, warningTitle } from './weather';

function warning(
  id: string,
  level: WeatherWarningDto['level'],
  validFrom: string,
): WeatherWarningDto {
  return {
    id,
    level,
    kinds: ['wind'],
    headline: id,
    validFrom,
    validTo: '2026-10-12T00:00:00.000Z',
    areas: [],
  };
}

const NOW = new Date('2026-10-10T12:00:00Z');

describe('warningTitle', () => {
  it('names the level and what it is for', () => {
    expect(warningTitle({ level: 'amber', kinds: ['wind'] })).toBe('Amber wind');
    expect(warningTitle({ level: 'yellow', kinds: ['rain', 'wind'] })).toBe('Yellow rain and wind');
    expect(warningTitle({ level: 'red', kinds: [] })).toBe('Red weather');
  });
});

describe('headlineWarning', () => {
  it('is nothing when there are no warnings', () => {
    expect(headlineWarning([], NOW)).toBeUndefined();
  });

  it('prefers the most severe', () => {
    const chosen = headlineWarning(
      [warning('y', 'yellow', '2026-10-10T06:00:00Z'), warning('r', 'red', '2026-10-11T06:00:00Z')],
      NOW,
    );
    expect(chosen?.id).toBe('r');
  });

  it('prefers one in force to one still to come at the same level', () => {
    const chosen = headlineWarning(
      [
        warning('later', 'amber', '2026-10-11T06:00:00Z'),
        warning('now', 'amber', '2026-10-10T06:00:00Z'),
      ],
      NOW,
    );
    expect(chosen?.id).toBe('now');
  });
});

describe('roundedForWeather', () => {
  it('rounds to a tenth of a degree', () => {
    expect(roundedForWeather({ lat: 54.9526, lon: -2.2149 })).toEqual({ lat: 55, lon: -2.2 });
  });
});
