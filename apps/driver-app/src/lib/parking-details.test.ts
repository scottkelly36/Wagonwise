import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

import { capacityText, costText, facilityStates, sourceText } from './parking-details';

const spot = (extra: Partial<SafeParkingSpotDto> = {}): SafeParkingSpotDto =>
  ({
    id: 's1',
    location: { lat: 50.7, lon: -3.5 },
    reportedAt: '2026-10-10T09:00:00.000Z',
    ...extra,
  }) as SafeParkingSpotDto;

describe('facilityStates', () => {
  it('lists every facility, green only for those known to be there', () => {
    const states = facilityStates(spot({ toilets: true, showers: true, food: true }));
    expect(states.map((s) => s.label)).toEqual([
      'Toilets',
      'Showers',
      'Shop',
      'Food',
      'Fuel',
      'Lit',
      'Secure',
    ]);
    expect(states.filter((s) => s.there).map((s) => s.key)).toEqual(['toilets', 'showers', 'food']);
  });

  it('treats a facility known to be missing and one nobody has mentioned the same: not there', () => {
    const states = facilityStates(spot({ toilets: false }));
    expect(states.every((s) => !s.there)).toBe(true);
  });
});

describe('costText', () => {
  it('says paid or free when known, and nothing when not', () => {
    expect(costText(spot({ paid: true }))).toBe('Paid');
    expect(costText(spot({ paid: false }))).toBe('Free');
    expect(costText(spot())).toBeUndefined();
  });
});

describe('sourceText', () => {
  it('says where a spot came from', () => {
    expect(sourceText(spot({ source: 'osm' }))).toBe('From OpenStreetMap');
    expect(sourceText(spot({ source: 'admin' }))).toBe('Added by WagonWise');
    expect(sourceText(spot({ source: 'driver' }))).toBe('Reported by a driver');
    expect(sourceText(spot())).toBe('Reported by a driver');
  });
});

describe('capacityText', () => {
  it('says how many lorries, or nothing when it is not known', () => {
    expect(capacityText(spot({ capacity: 40 }))).toBe('Space for about 40 lorries');
    expect(capacityText(spot({ capacity: 1 }))).toBe('Space for 1 lorry');
    expect(capacityText(spot())).toBeUndefined();
    expect(capacityText(spot({ capacity: 0 }))).toBeUndefined();
  });
});
