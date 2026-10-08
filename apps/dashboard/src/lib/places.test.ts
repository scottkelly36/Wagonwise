import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { describe, expect, it } from 'vitest';
import { mapLink, metresBetween, milesText, placesNearPoint } from './places';

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

describe('metresBetween', () => {
  it('is about 111 km for a degree of latitude', () => {
    expect(metresBetween({ lat: 54, lon: -2 }, { lat: 55, lon: -2 })).toBeCloseTo(111_320, -2);
  });

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = metresBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const atSixty = metresBetween({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    expect(atSixty / atEquator).toBeCloseTo(0.5, 2);
  });
});

describe('placesNearPoint', () => {
  const postcode = { lat: 54.95, lon: -2.2 };

  it('keeps places within range and puts the nearest first', () => {
    const found = placesNearPoint(
      [place('far', 54.98, -2.2), place('near', 54.951, -2.2), place('gone', 56, -2.2)],
      postcode,
    );
    expect(found.map((f) => f.place.name)).toEqual(['near', 'far']);
  });

  it('offers nothing when no place is near', () => {
    expect(placesNearPoint([place('gone', 56, -2.2)], postcode)).toEqual([]);
    expect(placesNearPoint([], postcode)).toEqual([]);
  });
});

describe('small helpers', () => {
  it('milesText', () => {
    expect(milesText(1609.344)).toBe('1.0 mi');
    expect(milesText(20)).toBe('under 0.1 mi');
  });

  it('mapLink points at the spot', () => {
    expect(mapLink({ lat: 54.95, lon: -2.2 })).toBe(
      'https://www.openstreetmap.org/?mlat=54.95&mlon=-2.2#map=18/54.95/-2.2',
    );
  });
});
