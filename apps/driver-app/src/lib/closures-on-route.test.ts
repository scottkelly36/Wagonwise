import type { RouteClosureDto } from '@wagonwise/contracts/closures';

import { closuresAtArrival, placeClosuresOnRoute } from './closures-on-route';

type Pt = { lat: number; lon: number };

const LON = -2.3;
/** A degree of latitude is about 111 km, so 0.001 is about 111 m. */
const M_PER_DEG_LAT = 111_320;

/** A straight line of points every 0.001 degrees of latitude, going north if `from` < `to` and south if not. */
function northSouth(from: number, to: number, lon = LON): Pt[] {
  const step = from <= to ? 0.001 : -0.001;
  const points: Pt[] = [];
  const n = Math.round(Math.abs(to - from) / 0.001);
  for (let i = 0; i <= n; i++) points.push({ lat: +(from + step * i).toFixed(6), lon });
  return points;
}

const asRoute = (points: readonly Pt[]): [number, number][] => points.map((p) => [p.lon, p.lat]);

/** The M-road the tests drive north along: 53.30 to 53.40, about 11 km. */
const route = asRoute(northSouth(53.3, 53.4));

const T0 = Date.parse('2026-11-02T20:00:00.000Z');

function closure(lines: Pt[][], overrides: Partial<RouteClosureDto> = {}): RouteClosureDto {
  const first = lines[0]![0]!;
  return {
    id: 'c1',
    kind: 'full',
    status: 'planned',
    road: 'M6',
    direction: 'northBound',
    description: 'M6 northbound carriageway closure',
    startsAt: '2026-11-02T20:00:00.000Z',
    endsAt: '2026-11-03T06:00:00.000Z',
    lanesClosed: 0,
    location: first,
    updatedAt: '2026-11-02T10:00:00.000Z',
    lines,
    ...overrides,
  };
}

const ids = (placed: readonly { closure: { id: string } }[]) => placed.map((p) => p.closure.id);

describe('placeClosuresOnRoute', () => {
  it('places a closure the route runs along, with how far along the route it starts and ends', () => {
    const [placed] = placeClosuresOnRoute(route, [closure([northSouth(53.34, 53.35)])]);
    expect(placed).toBeDefined();
    expect(placed!.fromM).toBeGreaterThan(0.04 * M_PER_DEG_LAT - 60);
    expect(placed!.fromM).toBeLessThan(0.04 * M_PER_DEG_LAT + 60);
    expect(placed!.toM).toBeGreaterThan(0.05 * M_PER_DEG_LAT - 60);
    expect(placed!.toM).toBeLessThan(0.05 * M_PER_DEG_LAT + 60);
    expect(placed!.routeM).toBeCloseTo(0.1 * M_PER_DEG_LAT, -1);
  });

  it('ignores a closure on the other carriageway: the same place, the other way', () => {
    const exactlyOnIt = closure([northSouth(53.35, 53.34)]);
    const beside = closure([northSouth(53.35, 53.34, LON + 0.0004)], { id: 'beside' });
    expect(placeClosuresOnRoute(route, [exactlyOnIt, beside])).toEqual([]);
  });

  it('ignores a closure on a road that runs alongside, a hundred metres away', () => {
    expect(
      placeClosuresOnRoute(route, [closure([northSouth(53.34, 53.35, LON + 0.0015)])]),
    ).toEqual([]);
  });

  it('ignores a road that crosses the route', () => {
    const crossing: Pt[] = [
      { lat: 53.35, lon: LON - 0.004 },
      { lat: 53.35, lon: LON + 0.004 },
    ];
    expect(placeClosuresOnRoute(route, [closure([crossing])])).toEqual([]);
  });

  it('ignores a slip road the route only passes, but places one it takes', () => {
    const slip: Pt[] = [
      { lat: 53.35, lon: LON },
      { lat: 53.351, lon: LON + 0.0003 },
      { lat: 53.352, lon: LON + 0.001 },
      { lat: 53.353, lon: LON + 0.002 },
      { lat: 53.354, lon: LON + 0.0035 },
    ];
    expect(placeClosuresOnRoute(route, [closure([slip])])).toEqual([]);

    const takingTheSlip = asRoute([
      ...northSouth(53.3, 53.349),
      ...slip,
      { lat: 53.36, lon: LON + 0.006 },
    ]);
    expect(ids(placeClosuresOnRoute(takingTheSlip, [closure([slip])]))).toEqual(['c1']);
  });

  it('places a long closure the route joins part-way along, but not one it only touches', () => {
    const joinsPartWay = asRoute(northSouth(53.34, 53.4));
    const longClosure = closure([northSouth(53.3, 53.36)]);
    expect(ids(placeClosuresOnRoute(joinsPartWay, [longClosure]))).toEqual(['c1']);

    const touchesAtTheEnd = asRoute(northSouth(53.358, 53.4));
    expect(placeClosuresOnRoute(touchesAtTheEnd, [longClosure])).toEqual([]);
  });

  it('joins up a closure drawn as several lines, in whatever order they are listed', () => {
    const parts = [northSouth(53.345, 53.35), northSouth(53.34, 53.345)];
    const [placed] = placeClosuresOnRoute(route, [closure(parts)]);
    expect(placed).toBeDefined();
    expect(placed!.toM - placed!.fromM).toBeGreaterThan(0.009 * M_PER_DEG_LAT);
  });

  it('puts the closures in the order the driver reaches them', () => {
    const later = closure([northSouth(53.37, 53.375)], { id: 'later' });
    const sooner = closure([northSouth(53.32, 53.325)], { id: 'sooner' });
    expect(ids(placeClosuresOnRoute(route, [later, sooner]))).toEqual(['sooner', 'later']);
  });

  it('places nothing for a route with no length or a closure with no lines', () => {
    expect(placeClosuresOnRoute([[LON, 53.3]], [closure([northSouth(53.34, 53.35)])])).toEqual([]);
    expect(placeClosuresOnRoute(route, [closure([[{ lat: 53.34, lon: LON }]])])).toEqual([]);
  });
});

describe('closuresAtArrival', () => {
  // Halfway along an hour's drive, so the driver reaches it half an hour after leaving.
  const halfway = placeClosuresOnRoute(route, [closure([northSouth(53.349, 53.351)])]);
  const trip = { leaveAtMs: T0, durationMin: 60 };

  it('keeps a closure in force when the driver gets there, and says when that will be', () => {
    const [found] = closuresAtArrival(halfway, trip);
    expect(found).toBeDefined();
    expect(Math.abs(found!.arrivesAt.getTime() - (T0 + 30 * 60_000))).toBeLessThan(2 * 60_000);
    expect(found!.mayBeOpen).toBe(false);
  });

  it('drops one that starts long after the driver has passed', () => {
    const lateTonight = placeClosuresOnRoute(route, [
      closure([northSouth(53.349, 53.351)], {
        startsAt: '2026-11-02T22:00:00.000Z',
        endsAt: '2026-11-03T06:00:00.000Z',
      }),
    ]);
    expect(closuresAtArrival(lateTonight, trip)).toEqual([]);
    // Leaving two hours later, the driver is there when it starts.
    expect(closuresAtArrival(lateTonight, { ...trip, leaveAtMs: T0 + 2 * 3_600_000 })).toHaveLength(
      1,
    );
  });

  it('drops one that ended before the driver gets there, but allows for the arrival time being out', () => {
    const endedAt = (iso: string) =>
      placeClosuresOnRoute(route, [
        closure([northSouth(53.349, 53.351)], {
          startsAt: '2026-11-02T10:00:00.000Z',
          endsAt: iso,
        }),
      ]);
    expect(closuresAtArrival(endedAt('2026-11-02T19:00:00.000Z'), trip)).toEqual([]);
    // Over twenty minutes before the expected arrival, but inside the half hour either way.
    expect(closuresAtArrival(endedAt('2026-11-02T20:10:00.000Z'), trip)).toHaveLength(1);
  });

  it('says a long window may not be shut at that time', () => {
    const weeks = placeClosuresOnRoute(route, [
      closure([northSouth(53.349, 53.351)], {
        startsAt: '2026-11-01T22:00:00.000Z',
        endsAt: '2026-11-08T06:00:00.000Z',
      }),
    ]);
    expect(closuresAtArrival(weeks, trip)[0]?.mayBeOpen).toBe(true);
  });

  it('leaves nothing out for a route with no closures', () => {
    expect(closuresAtArrival([], trip)).toEqual([]);
  });
});
