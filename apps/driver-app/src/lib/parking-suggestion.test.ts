import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

import { buildSuggestion, formFromSpot, nextFacility } from './parking-suggestion';

const spot: SafeParkingSpotDto = {
  id: '11111111-1111-4111-8111-111111111111' as SafeParkingSpotDto['id'],
  location: { lat: 54, lon: -2 },
  reportedAt: '2026-10-10T09:00:00.000Z',
  name: 'Exeter Truckstop',
  capacity: 40,
  note: 'Behind the services',
  toilets: true,
  showers: false,
};

describe('buildSuggestion', () => {
  it('says nothing changed when the form is as it started', () => {
    expect(buildSuggestion(spot, formFromSpot(spot))).toEqual({
      ok: false,
      problem: 'Change something first, then send.',
    });
  });

  it('sends only what was changed', () => {
    const form = {
      ...formFromSpot(spot),
      name: '  Exeter Services ',
      spaces: '55',
      facilities: { ...formFromSpot(spot).facilities, showers: true, fuel: true },
    };
    expect(buildSuggestion(spot, form)).toEqual({
      ok: true,
      request: { name: 'Exeter Services', capacity: 55, showers: true, fuel: true },
    });
  });

  it('turns down spaces that are not a whole number', () => {
    for (const spaces of ['lots', '-3', '12.5', '123456']) {
      expect(buildSuggestion(spot, { ...formFromSpot(spot), spaces }).ok).toBe(false);
    }
  });

  it('leaves a field the driver emptied alone, rather than clearing it', () => {
    const form = { ...formFromSpot(spot), name: '', note: '', spaces: '' };
    expect(buildSuggestion(spot, form).ok).toBe(false);
  });
});

describe('nextFacility', () => {
  it('goes from not sure to yes, then flips', () => {
    expect(nextFacility(undefined)).toBe(true);
    expect(nextFacility(true)).toBe(false);
    expect(nextFacility(false)).toBe(true);
  });
});
