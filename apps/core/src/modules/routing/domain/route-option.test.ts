import { describe, expect, it } from 'vitest';
import { buildRouteOptions, estimateFuelCostGBP } from './route-option.js';

describe('estimateFuelCostGBP', () => {
  it('computes distance × (consumption / 100) × price', () => {
    expect(estimateFuelCostGBP(100, 30, 1.6)).toBeCloseTo(48, 5);
  });

  it('returns undefined when consumption is undefined', () => {
    expect(estimateFuelCostGBP(100, undefined, 1.6)).toBeUndefined();
  });
});

describe('buildRouteOptions', () => {
  const fast = { geometry: 'fast-line', distanceKm: 120, durationMin: 90 };
  const short = { geometry: 'short-line', distanceKm: 80, durationMin: 110 };

  it('labels the lowest-duration candidate fastest and the lowest-distance candidate shortest', () => {
    const options = buildRouteOptions([fast, short], 30, 1.6);
    expect(options).toEqual([
      { ...fast, estimatedFuelCostGBP: estimateFuelCostGBP(120, 30, 1.6), labels: ['fastest'] },
      { ...short, estimatedFuelCostGBP: estimateFuelCostGBP(80, 30, 1.6), labels: ['shortest'] },
    ]);
  });

  it('merges a single candidate that is both fastest and shortest into one option with both labels', () => {
    const options = buildRouteOptions([fast], 30, 1.6);
    expect(options).toEqual([
      {
        ...fast,
        estimatedFuelCostGBP: estimateFuelCostGBP(120, 30, 1.6),
        labels: ['fastest', 'shortest'],
      },
    ]);
  });

  it('omits estimatedFuelCostGBP when consumption is undefined', () => {
    const options = buildRouteOptions([fast, short], undefined, 1.6);
    expect(options.every((o) => o.estimatedFuelCostGBP === undefined)).toBe(true);
  });

  describe('tolls', () => {
    it('says which routes have a toll, and nothing about a route the engine did not say about', () => {
      const options = buildRouteOptions([{ ...fast, hasToll: true }, short], 30, 1.6);
      expect(options[0]).toMatchObject({ labels: ['fastest'], hasToll: true });
      expect(options[1]).not.toHaveProperty('hasToll');
    });

    it('adds a toll-free route found by a search as its own card, and it is not the fastest or the shortest however quick it is', () => {
      const tollFree = {
        geometry: 'toll-free-line',
        distanceKm: 70,
        durationMin: 80,
        hasToll: false,
        tollFree: true,
        fromSearch: true,
      };
      const options = buildRouteOptions([{ ...fast, hasToll: true }, short, tollFree], 30, 1.6);
      expect(options.map((o) => o.labels)).toEqual([['fastest'], ['shortest'], ['toll-free']]);
    });

    it('adds the toll-free label to a route the engine already offered, keeping its own label', () => {
      const options = buildRouteOptions(
        [
          { ...fast, hasToll: true },
          { ...short, hasToll: false, tollFree: true },
        ],
        30,
        1.6,
      );
      expect(options.map((o) => o.labels)).toEqual([['fastest'], ['shortest', 'toll-free']]);
    });
  });
});
