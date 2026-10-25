import { describe, expect, it } from 'vitest';
import { placeMapLink, reasonsText } from './reported-places';

describe('reasonsText', () => {
  it('puts the most common reason first and shows how many said it', () => {
    expect(
      reasonsText([
        { reason: 'wrong_place', count: 1 },
        { reason: 'offensive', count: 2 },
      ]),
    ).toBe('Offensive name or note × 2, In the wrong place');
  });

  it('is empty for no reasons', () => {
    expect(reasonsText([])).toBe('');
  });
});

describe('placeMapLink', () => {
  it('opens the spot on OpenStreetMap', () => {
    expect(placeMapLink({ lat: 54.97, lon: -2.1 })).toBe(
      'https://www.openstreetmap.org/?mlat=54.97&mlon=-2.1#map=18/54.97/-2.1',
    );
  });
});
