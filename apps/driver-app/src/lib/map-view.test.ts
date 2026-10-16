import { MAX_QUERY_RADIUS_M, MAX_VIEW_WIDTH_KM, viewFromBounds } from './map-view';

// Roughly a town-sized screen around Hexham: about 8 km wide.
const town: [number, number, number, number] = [-2.15, 54.94, -2.05, 55.0];

describe('viewFromBounds', () => {
  it('centres on the middle of the screen and reaches its corners', () => {
    const view = viewFromBounds(town);
    expect(view.centre.lat).toBeCloseTo(54.97, 2);
    expect(view.centre.lon).toBeCloseTo(-2.1, 2);
    expect(view.widthKm).toBeGreaterThan(5);
    expect(view.widthKm).toBeLessThan(8);
    // Half the diagonal is a little over half the width.
    expect(view.radiusM).toBeGreaterThan((view.widthKm * 1000) / 2);
    expect(view.tooWide).toBe(false);
  });

  it('says a country-sized view is too wide to draw markers for, and caps the query radius', () => {
    const country = viewFromBounds([-6, 50, 2, 59]);
    expect(country.tooWide).toBe(true);
    expect(country.widthKm).toBeGreaterThan(MAX_VIEW_WIDTH_KM);
    expect(country.radiusM).toBe(MAX_QUERY_RADIUS_M);
  });

  it('draws the line at the width limit', () => {
    // At 55 degrees north a degree of longitude is about 64 km.
    const justUnder = viewFromBounds([-2, 55, -2 + (MAX_VIEW_WIDTH_KM - 2) / 64, 55.1]);
    const justOver = viewFromBounds([-2, 55, -2 + (MAX_VIEW_WIDTH_KM + 2) / 64, 55.1]);
    expect(justUnder.tooWide).toBe(false);
    expect(justOver.tooWide).toBe(true);
  });

  it('never asks for less than a small radius, however far in the driver zooms', () => {
    const tiny = viewFromBounds([-2.1, 54.97, -2.0999, 54.9701]);
    expect(tiny.radiusM).toBe(500);
  });
});
