import { mapTapTarget } from './route-points';

describe('mapTapTarget', () => {
  it('sets the start when only From is on Map', () => {
    expect(mapTapTarget('map', 'search', 'destination')).toBe('origin');
  });

  it('sets the destination when only To is on Map', () => {
    expect(mapTapTarget('here', 'map', 'origin')).toBe('destination');
    expect(mapTapTarget('search', 'map', 'origin')).toBe('destination');
  });

  it('sets the one chosen last when both are on Map', () => {
    expect(mapTapTarget('map', 'map', 'origin')).toBe('origin');
    expect(mapTapTarget('map', 'map', 'destination')).toBe('destination');
  });

  it('sets the destination when neither is on Map', () => {
    expect(mapTapTarget('here', 'search', 'origin')).toBe('destination');
  });
});
