import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import {
  hillsLine,
  hillsWereChecked,
  routeOptionTitle,
  strategyForOption,
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
