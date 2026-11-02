import type { RouteClosureDto } from '@wagonwise/contracts/closures';

import type { ClosureOnRoute } from './closures-on-route';
import { hasFullClosure, routeClosureDetail, routeClosureHeadline } from './route-closure-text';

const closure = (overrides: Partial<RouteClosureDto> = {}): RouteClosureDto => ({
  id: 'c1',
  kind: 'full',
  status: 'planned',
  road: 'M56',
  description: 'M56 eastbound carriageway closure',
  startsAt: '2026-11-02T22:00:00.000Z',
  endsAt: '2026-11-03T06:00:00.000Z',
  lanesClosed: 0,
  location: { lat: 53.36, lon: -2.3 },
  updatedAt: '2026-11-02T10:00:00.000Z',
  lines: [],
  ...overrides,
});

const onRoute = (
  overrides: Partial<RouteClosureDto> = {},
  rest: Partial<ClosureOnRoute> = {},
): ClosureOnRoute => ({
  closure: closure(overrides),
  fromM: 1000,
  toM: 2000,
  routeM: 10_000,
  arrivesAt: new Date('2026-11-02T23:10:00.000Z'),
  mayBeOpen: false,
  ...rest,
});

describe('routeClosureHeadline', () => {
  it('says a full closure is closed, and a long window only that it may be', () => {
    expect(routeClosureHeadline(onRoute())).toBe('M56 is closed on your route');
    expect(routeClosureHeadline(onRoute({}, { mayBeOpen: true }))).toBe(
      'M56 may be closed on your route',
    );
  });

  it('says how many lanes for a lane closure, and copes with no road name', () => {
    expect(routeClosureHeadline(onRoute({ kind: 'lane', lanesClosed: 1 }))).toBe(
      'M56: a lane is closed on your route',
    );
    expect(routeClosureHeadline(onRoute({ kind: 'lane', lanesClosed: 2 }))).toBe(
      'M56: 2 lanes are closed on your route',
    );
    expect(routeClosureHeadline(onRoute({ kind: 'lane', lanesClosed: 0 }))).toBe(
      'M56: lanes are closed on your route',
    );
    expect(routeClosureHeadline(onRoute({ road: undefined }))).toBe(
      'The road is closed on your route',
    );
  });
});

describe('routeClosureDetail', () => {
  it('gives the end when the driver gets there while it is shut', () => {
    expect(routeClosureDetail(onRoute())).toMatch(
      /^Closed until Tue 3 Nov, 06:00 · you reach it about \d{2}:\d{2}$/,
    );
  });

  it('gives the start when the driver gets there before it', () => {
    expect(
      routeClosureDetail(onRoute({}, { arrivesAt: new Date('2026-11-02T21:40:00.000Z') })),
    ).toMatch(/^Closes Mon 2 Nov, 22:00 · you reach it about \d{2}:\d{2}$/);
  });

  it('says "at times" for a long window', () => {
    expect(routeClosureDetail(onRoute({}, { mayBeOpen: true }))).toMatch(
      /^Closed at times until Tue 3 Nov, 06:00/,
    );
  });
});

describe('hasFullClosure', () => {
  it('is true only when a whole road is shut', () => {
    expect(hasFullClosure([onRoute({ kind: 'lane' })])).toBe(false);
    expect(hasFullClosure([onRoute({ kind: 'lane' }), onRoute()])).toBe(true);
    expect(hasFullClosure([])).toBe(false);
  });
});
