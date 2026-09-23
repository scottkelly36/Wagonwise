import { mapStyleUrl } from './map-style';

describe('mapStyleUrl', () => {
  it("falls back to MapLibre's free demo style with no API key", () => {
    expect(mapStyleUrl(undefined)).toBe('https://demotiles.maplibre.org/style.json');
  });

  it('falls back for an empty-string key too, not just undefined', () => {
    expect(mapStyleUrl('')).toBe('https://demotiles.maplibre.org/style.json');
  });

  it('builds a MapTiler style URL once a real key is set', () => {
    expect(mapStyleUrl('abc123')).toBe(
      'https://api.maptiler.com/maps/streets-v2/style.json?key=abc123',
    );
  });
});
