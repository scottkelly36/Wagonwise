import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import {
  hillsLine,
  hillsWereChecked,
  routeOptionTitle,
  strategyForOption,
  tollLine,
  tollLines,
  zoneLines,
  zonesShown,
  cheapestLine,
  costLine,
} from './route-option-text';

const base = { geometry: 'g', distanceKm: 100, durationMin: 90 };
const hills = { climbM: 900, highestPointM: 328, steepestPct: 7, steepKm: 2.3, steepStretches: 3 };

describe('routeOptionTitle', () => {
  it('names each label, joined when one route has several', () => {
    expect(routeOptionTitle({ ...base, labels: ['fastest'] })).toBe('Fastest');
    expect(routeOptionTitle({ ...base, labels: ['gentle'] })).toBe('Fewer hills');
    expect(routeOptionTitle({ ...base, labels: ['fastest', 'shortest', 'gentle'] })).toBe(
      'Fastest & Shortest & Fewer hills',
    );
  });
});

describe('strategyForOption', () => {
  it('asks the ordinary way for a route that is the quickest, even if it is also the gentlest', () => {
    expect(strategyForOption({ ...base, labels: ['fastest', 'gentle'] })).toBe('fastest');
  });

  it('asks for the gentle route by name when it is not the quickest', () => {
    expect(strategyForOption({ ...base, labels: ['gentle'] })).toBe('gentle');
    expect(strategyForOption({ ...base, labels: ['shortest', 'gentle'] })).toBe('gentle');
  });

  it('asks for the shortest otherwise', () => {
    expect(strategyForOption({ ...base, labels: ['shortest'] })).toBe('shortest');
  });

  it('asks for the toll-free route by name, but the engine’s own shortest when that is also toll free', () => {
    expect(strategyForOption({ ...base, labels: ['toll-free'] })).toBe('toll-free');
    expect(strategyForOption({ ...base, labels: ['shortest', 'toll-free'] })).toBe('shortest');
  });
});

describe('tollLine', () => {
  it('says so when the route has a toll, and nothing otherwise', () => {
    expect(tollLine({ ...base, labels: ['fastest'], hasToll: true })).toBe('Includes a toll');
    expect(tollLine({ ...base, labels: ['fastest'], hasToll: false })).toBeUndefined();
    expect(tollLine({ ...base, labels: ['fastest'] })).toBeUndefined();
  });

  it('names the toll-free card', () => {
    expect(routeOptionTitle({ ...base, labels: ['toll-free'] })).toBe('Toll free');
    expect(routeOptionTitle({ ...base, labels: ['shortest', 'toll-free'] })).toBe(
      'Shortest & Toll free',
    );
  });
});

describe('tollLines', () => {
  const dartford = { name: 'Dartford Crossing', lowGBP: 8.4, highGBP: 8.4 };

  it('names each toll with the price worked out for the vehicle', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      hasToll: true,
      charges: [
        { ...dartford, note: 'Charged from 6am to 10pm.', payBy: 'Pay by midnight the day after.' },
      ],
    };
    expect(tollLines(option)).toEqual([
      {
        text: 'Toll: Dartford Crossing, £8.40',
        detail: 'Charged from 6am to 10pm. Pay by midnight the day after.',
      },
    ]);
  });

  it('shows a range when the axles could put the vehicle in two classes', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      hasToll: true,
      charges: [{ name: 'Dartford Crossing', lowGBP: 4.2, highGBP: 8.4 }],
    };
    expect(tollLines(option)[0]?.text).toBe('Toll: Dartford Crossing, £4.20 to £8.40');
  });

  it('says the price is not known rather than leaving it out, when the table has none for the vehicle', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      hasToll: true,
      charges: [{ name: 'Humber Bridge' }],
    };
    expect(tollLines(option)).toEqual([
      { text: 'Toll: Humber Bridge, price not known for your vehicle' },
    ]);
  });

  it('gives one line per toll, in order', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      hasToll: true,
      charges: [dartford, { name: 'M6 Toll', lowGBP: 20.9, highGBP: 20.9 }],
    };
    expect(tollLines(option).map((l) => l.text)).toEqual([
      'Toll: Dartford Crossing, £8.40',
      'Toll: M6 Toll, £20.90',
    ]);
  });

  it('falls back to "Includes a toll" for a toll that could not be named, and says nothing for none', () => {
    expect(tollLines({ ...base, labels: ['fastest'], hasToll: true })).toEqual([
      { text: 'Includes a toll' },
    ]);
    expect(tollLines({ ...base, labels: ['fastest'], hasToll: true, charges: [] })).toEqual([
      { text: 'Includes a toll' },
    ]);
    expect(tollLines({ ...base, labels: ['fastest'], hasToll: false })).toEqual([]);
    expect(tollLines({ ...base, labels: ['fastest'] })).toEqual([]);
  });
});

describe('zoneLines', () => {
  const glasgow = { name: 'Glasgow Low Emission Zone', penaltyGBP: 60 };

  it('tells a vehicle that has not said whether it is Euro VI that a penalty may apply, and where to say', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      zones: [{ ...glasgow, status: 'may-be-charged' }],
    };
    expect(zoneLines(option)).toEqual([
      {
        text: 'Glasgow Low Emission Zone: a penalty of £60 applies to a vehicle that is not Euro VI. Say whether yours is, in its details.',
        charged: false,
      },
    ]);
  });

  it('tells a vehicle that is not Euro VI that the penalty applies', () => {
    const option: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      zones: [{ ...glasgow, status: 'charged' }],
    };
    expect(zoneLines(option)).toEqual([
      {
        text: 'Glasgow Low Emission Zone: your vehicle is not Euro VI, so a penalty of £60 applies (more if repeated).',
        charged: true,
      },
    ]);
  });

  it('says an English zone’s daily charge, to a vehicle that is not Euro VI and to one that has not said', () => {
    const daily = {
      name: 'Bristol Clean Air Zone',
      kind: 'daily' as const,
      dailyChargeGBP: { lowGBP: 100, highGBP: 100 },
    };
    const base2: RouteOptionDto = { ...base, labels: ['fastest'] };
    expect(zoneLines({ ...base2, zones: [{ ...daily, status: 'charged' }] })).toEqual([
      {
        text: 'Bristol Clean Air Zone: your vehicle is not Euro VI, so a charge of £100 a day applies.',
        charged: true,
      },
    ]);
    expect(zoneLines({ ...base2, zones: [{ ...daily, status: 'may-be-charged' }] })).toEqual([
      {
        text: 'Bristol Clean Air Zone: a charge of £100 a day applies to a vehicle that is not Euro VI. Say whether yours is, in its details.',
        charged: false,
      },
    ]);
  });

  it('says London’s range, and a plain daily charge when the amount is not given', () => {
    const base2: RouteOptionDto = { ...base, labels: ['fastest'] };
    const london = {
      name: 'London Low Emission Zone',
      kind: 'daily' as const,
      status: 'charged' as const,
      dailyChargeGBP: { lowGBP: 100, highGBP: 300 },
    };
    expect(zoneLines({ ...base2, zones: [london] })[0]?.text).toBe(
      'London Low Emission Zone: your vehicle is not Euro VI, so a charge of £100 to £300 a day applies.',
    );
    expect(
      zoneLines({
        ...base2,
        zones: [{ name: 'X Clean Air Zone', kind: 'daily', status: 'charged' }],
      })[0]?.text,
    ).toBe('X Clean Air Zone: your vehicle is not Euro VI, so a daily charge applies.');
  });

  it('gives a line for each zone, and nothing for none or when the server did not say', () => {
    const two: RouteOptionDto = {
      ...base,
      labels: ['fastest'],
      zones: [
        { ...glasgow, status: 'charged' },
        { name: 'Edinburgh Low Emission Zone', penaltyGBP: 60, status: 'may-be-charged' },
      ],
    };
    expect(zoneLines(two).map((l) => l.text.split(':')[0])).toEqual([
      'Glasgow Low Emission Zone',
      'Edinburgh Low Emission Zone',
    ]);
    expect(zoneLines({ ...base, labels: ['fastest'], zones: [] })).toEqual([]);
    expect(zoneLines({ ...base, labels: ['fastest'] })).toEqual([]);
  });
});

describe('the Cheapest label', () => {
  it('is named in the title, beside the label of the route it sits on', () => {
    expect(routeOptionTitle({ ...base, labels: ['shortest', 'cheapest'] })).toBe(
      'Shortest & Cheapest',
    );
    expect(routeOptionTitle({ ...base, labels: ['toll-free', 'cheapest'] })).toBe(
      'Toll free & Cheapest',
    );
  });

  it('is planned by the other label on the route, since the route can be made again by that', () => {
    expect(strategyForOption({ ...base, labels: ['fastest', 'cheapest'] })).toBe('fastest');
    expect(strategyForOption({ ...base, labels: ['shortest', 'cheapest'] })).toBe('shortest');
    expect(strategyForOption({ ...base, labels: ['gentle', 'cheapest'] })).toBe('gentle');
    expect(strategyForOption({ ...base, labels: ['toll-free', 'cheapest'] })).toBe('toll-free');
  });
});

describe('costLine', () => {
  const withCost = (cost: NonNullable<RouteOptionDto['cost']>): RouteOptionDto => ({
    ...base,
    labels: ['fastest'],
    cost,
  });

  it('adds the tolls and zone charges to the fuel for a route that has some', () => {
    expect(costLine(withCost({ fuelGBP: 57.6, chargesGBP: 8.4, totalGBP: 66 }))).toBe(
      'About £66.00 in all: £57.60 fuel and £8.40 in tolls and zone charges.',
    );
  });

  it('says the cost is at least that, and why, when a toll has no price', () => {
    expect(
      costLine(withCost({ fuelGBP: 57.6, chargesGBP: 8.4, totalGBP: 66, unpriced: true })),
    ).toBe(
      'About at least £66.00 in all: £57.60 fuel and £8.40 in tolls and zone charges, and a toll with no price.',
    );
  });

  it('says nothing when there is nothing to add to the fuel, no fuel figure, or no cost', () => {
    expect(costLine(withCost({ fuelGBP: 57.6, chargesGBP: 0, totalGBP: 57.6 }))).toBeUndefined();
    expect(costLine(withCost({ chargesGBP: 8.4 }))).toBeUndefined();
    expect(costLine({ ...base, labels: ['fastest'] })).toBeUndefined();
  });
});

describe('cheapestLine', () => {
  const priced = (
    labels: RouteOptionDto['labels'],
    durationMin: number,
    totalGBP: number,
  ): RouteOptionDto => ({
    ...base,
    labels,
    durationMin,
    cost: { fuelGBP: totalGBP, chargesGBP: 0, totalGBP },
  });

  it('says what it saves against the fastest, and how much longer it takes', () => {
    const fastest = priced(['fastest'], 90, 57.6);
    const cheapest = priced(['shortest', 'cheapest'], 110, 38.4);
    expect(cheapestLine(cheapest, [fastest, cheapest])).toBe(
      '£19.20 less than the fastest, 20 min longer.',
    );
  });

  it('says hours for a long difference', () => {
    const fastest = priced(['fastest'], 90, 100);
    const cheapest = priced(['toll-free', 'cheapest'], 215, 60);
    expect(cheapestLine(cheapest, [fastest, cheapest])).toBe(
      '£40.00 less than the fastest, 2 h 5 min longer.',
    );
  });

  it('says only that it is the cheapest when it is also the fastest', () => {
    const both = priced(['fastest', 'cheapest'], 90, 38.4);
    expect(cheapestLine(both, [both, priced(['shortest'], 110, 60)])).toBe(
      'The cheapest of these routes, and the fastest.',
    );
  });

  it('says nothing for a card that is not the cheapest', () => {
    const fastest = priced(['fastest'], 90, 57.6);
    expect(cheapestLine(fastest, [fastest])).toBeUndefined();
  });

  it('falls back to a plain line when the fastest route’s cost is not known', () => {
    const cheapest = priced(['shortest', 'cheapest'], 110, 38.4);
    expect(cheapestLine(cheapest, [cheapest])).toBe('The cheapest of these routes.');
  });
});

describe('zonesShown', () => {
  it('is true only when a route enters a zone, so the credit is not shown for nothing', () => {
    const zone = { name: 'Glasgow Low Emission Zone', status: 'charged' as const, penaltyGBP: 60 };
    expect(zonesShown([{ ...base, labels: ['fastest'], zones: [zone] }])).toBe(true);
    expect(zonesShown([{ ...base, labels: ['fastest'], zones: [] }])).toBe(false);
    expect(zonesShown([{ ...base, labels: ['fastest'] }])).toBe(false);
  });
});

describe('hillsLine', () => {
  it('says nothing when the hills were not checked', () => {
    expect(hillsLine({ ...base, labels: ['fastest'] }, 'km')).toBeUndefined();
  });

  it('gives the steep road and the highest point, in the distance unit the driver chose', () => {
    const option: RouteOptionDto = { ...base, labels: ['gentle'], hills };
    expect(hillsLine(option, 'km')).toBe('2.3 km of steep hill · highest point 328 m');
    expect(hillsLine(option, 'miles')).toBe('1.4 mi of steep hill · highest point 328 m');
  });

  it('says there are no steep hills when there are none to speak of', () => {
    const option: RouteOptionDto = { ...base, labels: ['gentle'], hills: { ...hills, steepKm: 0 } };
    expect(hillsLine(option, 'km')).toBe('No steep hills · highest point 328 m');
  });
});

describe('hillsWereChecked', () => {
  it('is true when any option has hill figures', () => {
    expect(hillsWereChecked([{ ...base, labels: ['fastest'] }])).toBe(false);
    expect(hillsWereChecked([{ ...base, labels: ['fastest'], hills }])).toBe(true);
  });
});
