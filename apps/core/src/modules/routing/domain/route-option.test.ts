import { describe, expect, it } from 'vitest';
import {
  buildRouteOptions,
  estimateFuelCostGBP,
  markCheapest,
  MIN_CHEAPEST_MARGIN_GBP,
  routeCostOf,
  type RouteOption,
} from './route-option.js';
import type { RouteCharge } from './tolls.js';
import type { RouteZone } from './zones.js';

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

describe('routeCostOf', () => {
  const toll = (highGBP?: number): RouteCharge => ({
    id: 't',
    name: 'Dartford Crossing',
    ...(highGBP === undefined ? {} : { lowGBP: highGBP, highGBP }),
  });
  const penaltyZone: RouteZone = {
    id: 'glasgow',
    name: 'Glasgow Low Emission Zone',
    status: 'may-be-charged',
    charge: { kind: 'penalty', firstGBP: 60 },
  };
  const dailyZone: RouteZone = {
    id: 'london',
    name: 'London Low Emission Zone',
    status: 'charged',
    charge: { kind: 'daily', lowGBP: 100, highGBP: 300 },
  };

  it('is just the fuel for a route with no charges', () => {
    expect(routeCostOf({ estimatedFuelCostGBP: 48 })).toEqual({
      fuelGBP: 48,
      chargesGBP: 0,
      totalGBP: 48,
    });
  });

  it('adds the tolls and the zone charges, counting a range at its top', () => {
    expect(
      routeCostOf({
        estimatedFuelCostGBP: 40,
        hasToll: true,
        charges: [toll(8.4)],
        zones: [penaltyZone, dailyZone],
      }),
    ).toEqual({ fuelGBP: 40, chargesGBP: 368.4, totalGBP: 408.4 });
  });

  it('has no total without a fuel figure, so charges alone cannot make a long route look cheap', () => {
    expect(routeCostOf({ hasToll: true, charges: [toll(8.4)] })).toEqual({ chargesGBP: 8.4 });
  });

  it('says the figures are a floor when a toll has no price, or is not named', () => {
    expect(
      routeCostOf({ estimatedFuelCostGBP: 40, hasToll: true, charges: [toll()] }).unpriced,
    ).toBe(true);
    expect(routeCostOf({ estimatedFuelCostGBP: 40, hasToll: true }).unpriced).toBe(true);
    expect(routeCostOf({ estimatedFuelCostGBP: 40, hasToll: false }).unpriced).toBeUndefined();
  });
});

describe('markCheapest and costs in buildRouteOptions', () => {
  const route = (
    geometry: string,
    durationMin: number,
    distanceKm: number,
    extra: Partial<RouteOption> = {},
  ) => ({ geometry, distanceKm, durationMin, ...extra });
  const dartford: RouteCharge = {
    id: 'dartford',
    name: 'Dartford Crossing',
    lowGBP: 8.4,
    highGBP: 8.4,
  };

  it('gives each option a cost, and marks nothing, when the app did not ask for costs', () => {
    const options = buildRouteOptions([route('a', 90, 120), route('b', 110, 80)], 30, 1.6);
    expect(options.every((o) => o.cost === undefined)).toBe(true);
    expect(options.flatMap((o) => o.labels)).not.toContain('cheapest');
  });

  it('marks the cheapest of the labelled routes, with its cost, when it is clearly so', () => {
    // 120 km at 30 L/100km and £1.60 is £57.60; 80 km is £38.40: £19.20 less, though 20 minutes slower.
    const options = buildRouteOptions([route('a', 90, 120), route('b', 110, 80)], 30, 1.6, true);
    expect(options.map((o) => [o.geometry, o.labels])).toEqual([
      ['a', ['fastest']],
      ['b', ['shortest', 'cheapest']],
    ]);
    expect(options[1]?.cost).toEqual({ fuelGBP: 38.4, chargesGBP: 0, totalGBP: 38.4 });
  });

  it('counts a toll against the route that has it, so the cheaper road can lose to the dearer one', () => {
    // The fastest road is 120 km (£57.60) with a £8.40 toll: £66. The shortest is 80 km (£38.40) and has none.
    const options = buildRouteOptions(
      [route('a', 90, 120, { hasToll: true, charges: [dartford] }), route('b', 110, 80)],
      30,
      1.6,
      true,
    );
    expect(options[0]?.cost?.totalGBP).toBe(66);
    expect(options[1]?.labels).toContain('cheapest');
  });

  it('puts the label on the fastest route too when it is the cheapest, and only ever beside another label', () => {
    // The fastest road is 100 km (£48). The shortest is 80 km (£38.40) but has a £30 toll: £68.40. So the fastest is the cheapest.
    const bigToll: RouteCharge = { id: 'x', name: 'A big toll', lowGBP: 30, highGBP: 30 };
    const options = buildRouteOptions(
      [route('a', 90, 100), route('b', 110, 80, { hasToll: true, charges: [bigToll] })],
      30,
      1.6,
      true,
    );
    expect(options[0]?.labels).toEqual(['fastest', 'cheapest']);
    expect(options[1]?.labels).toEqual(['shortest']);
    // Every option that carries 'cheapest' carries another label, so choosing it can be planned again by that label.
    for (const o of options) {
      if (o.labels.includes('cheapest')) expect(o.labels.length).toBeGreaterThan(1);
    }
  });

  it('marks nothing when the routes cost within the margin of each other', () => {
    // 100 km and 101 km differ by well under £2 of fuel.
    const options = buildRouteOptions([route('a', 90, 100), route('b', 100, 101)], 30, 1.6, true);
    expect(options.flatMap((o) => o.labels)).not.toContain('cheapest');
    expect(MIN_CHEAPEST_MARGIN_GBP).toBe(2);
  });

  it('marks nothing without a fuel economy, since charges alone are not a fair comparison', () => {
    const options = buildRouteOptions(
      [route('a', 90, 120), route('b', 110, 80)],
      undefined,
      1.6,
      true,
    );
    expect(options.flatMap((o) => o.labels)).not.toContain('cheapest');
    expect(options[0]?.cost).toEqual({ chargesGBP: 0 });
  });

  it('marks nothing when a toll on one route has no price, because the comparison would not be fair', () => {
    const options = buildRouteOptions(
      [route('a', 90, 120, { hasToll: true }), route('b', 110, 80)],
      30,
      1.6,
      true,
    );
    expect(options[0]?.cost?.unpriced).toBe(true);
    expect(options.flatMap((o) => o.labels)).not.toContain('cheapest');
  });

  it('marks nothing for a single route', () => {
    const options = buildRouteOptions([route('a', 90, 120)], 30, 1.6, true);
    expect(options.flatMap((o) => o.labels)).not.toContain('cheapest');
  });

  it('is what markCheapest does to options that already have costs', () => {
    const cost = (totalGBP: number) => ({ chargesGBP: 0, fuelGBP: totalGBP, totalGBP });
    const a: RouteOption = {
      geometry: 'a',
      distanceKm: 1,
      durationMin: 5,
      labels: ['fastest'],
      cost: cost(30),
    };
    const b: RouteOption = {
      geometry: 'b',
      distanceKm: 1,
      durationMin: 9,
      labels: ['shortest'],
      cost: cost(10),
    };
    expect(markCheapest([a, b]).map((o) => o.labels)).toEqual([
      ['fastest'],
      ['shortest', 'cheapest'],
    ]);
    // The same totals tie to the pound: the quicker one is chosen.
    const c: RouteOption = { ...b, cost: cost(30) };
    expect(markCheapest([a, c])).toEqual([a, c]);
  });
});
