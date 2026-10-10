import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

import { capacityText, facilityChips, sourceText } from './parking-details';

const spot = (extra: Partial<SafeParkingSpotDto> = {}): SafeParkingSpotDto =>
  ({
    id: 's1',
    location: { lat: 50.7, lon: -3.5 },
    reportedAt: '2026-10-10T09:00:00.000Z',
    ...extra,
  }) as SafeParkingSpotDto;

describe('facilityChips', () => {
  it('shows only what is known to be there, cost first', () => {
    const chips = facilityChips(spot({ paid: true, toilets: true, showers: true, food: true }));
    expect(chips.map((c) => c.label)).toEqual(['Paid', 'Toilets', 'Showers', 'Food']);
  });

  it('says free when it is known to cost nothing', () => {
    expect(facilityChips(spot({ paid: false })).map((c) => c.label)).toEqual(['Free']);
  });

  it('leaves off what is unknown and what is known to be missing', () => {
    expect(facilityChips(spot())).toEqual([]);
    expect(facilityChips(spot({ toilets: false, showers: false }))).toEqual([]);
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
