import type { SavedPlaceDto } from '@wagonwise/contracts/places';

import { defaultPlaceName, markingCompanyIdFor, placesNear } from './places';

function place(name: string, lat: number, lon: number): SavedPlaceDto {
  return {
    id: name,
    category: 'farm',
    name,
    location: { lat, lon },
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T10:00:00.000Z',
  } as unknown as SavedPlaceDto;
}

describe('placesNear', () => {
  const stop = { lat: 54.95, lon: -2.2 };

  it('keeps those within range, nearest first', () => {
    const found = placesNear(
      [place('far', 54.98, -2.2), place('near', 54.951, -2.2), place('gone', 56, -2.2)],
      stop,
      5000,
    );
    expect(found.map((f) => f.place.name)).toEqual(['near', 'far']);
    expect(found[0]?.distanceM).toBeLessThan(found[1]?.distanceM ?? 0);
  });

  it('is empty when nothing is near, or there are no places', () => {
    expect(placesNear([], stop)).toEqual([]);
    expect(placesNear([place('gone', 56, -2.2)], stop)).toEqual([]);
  });
});

describe('defaultPlaceName', () => {
  it('uses the stop’s name when there is one, otherwise the category', () => {
    expect(defaultPlaceName('  Smith’s Farm ', 'farm')).toBe('Smith’s Farm');
    expect(defaultPlaceName(undefined, 'farm')).toBe('Farm');
    expect(defaultPlaceName('   ', 'yard')).toBe('Yard');
  });
});

describe('markingCompanyIdFor', () => {
  it('uses the job’s company first', () => {
    expect(markingCompanyIdFor('job-co', ['a', 'b'])).toBe('job-co');
  });

  it('uses the only active company when there is no job', () => {
    expect(markingCompanyIdFor(undefined, ['only'])).toBe('only');
  });

  it('is personal with no company, or when it is ambiguous', () => {
    expect(markingCompanyIdFor(undefined, [])).toBeUndefined();
    expect(markingCompanyIdFor(undefined, ['a', 'b'])).toBeUndefined();
  });
});
