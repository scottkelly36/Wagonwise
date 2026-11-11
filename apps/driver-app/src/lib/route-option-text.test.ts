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
