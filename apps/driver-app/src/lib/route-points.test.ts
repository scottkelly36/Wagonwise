import { mapTapTarget, targetAfterTap } from './route-points';

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

describe('targetAfterTap', () => {
  it('moves on to the destination after the start when it is not set', () => {
    expect(targetAfterTap('origin', 'map', 'map', false, 'origin')).toBe('destination');
  });

  it('keeps moving the start when the destination is already set', () => {
    expect(targetAfterTap('origin', 'map', 'map', true, 'origin')).toBe('origin');
  });

  it('goes back to the start after the destination when the start is not set', () => {
    expect(targetAfterTap('destination', 'map', 'map', false, 'destination')).toBe('origin');
  });

  it('keeps moving the destination once both are set', () => {
    expect(targetAfterTap('destination', 'map', 'map', true, 'destination')).toBe('destination');
  });

  it('does not move on when the other end is not on Map', () => {
    expect(targetAfterTap('origin', 'map', 'search', false, 'origin')).toBe('origin');
    expect(targetAfterTap('destination', 'here', 'map', false, 'destination')).toBe('destination');
  });
});
