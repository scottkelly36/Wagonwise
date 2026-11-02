import { describe, expect, it } from 'vitest';
import {
  closuresAtArrival,
  indexRoute,
  lookAheadHours,
  mustAvoid,
  placeClosuresOnRoute,
  type ClosureCandidate,
} from './closure-on-route.js';
import type { GeoPoint } from './geo.js';

const LON = -2.3;
/** A degree of latitude is about 111 km, so 0.001 is about 111 m. */
const M_PER_DEG_LAT = 111_320;

/** A straight line of points every 0.001 degrees of latitude, going north if `from` < `to` and south if not. */
function northSouth(from: number, to: number, lon = LON): GeoPoint[] {
  const step = from <= to ? 0.001 : -0.001;
  const n = Math.round(Math.abs(to - from) / 0.001);
  return Array.from({ length: n + 1 }, (_, i) => ({ lat: +(from + step * i).toFixed(6), lon }));
}

/** The M-road the tests drive north along: 53.30 to 53.40, about 11 km. */
const route = indexRoute(northSouth(53.3, 53.4));

const T0 = new Date('2026-11-02T20:00:00.000Z');

function closure(lines: GeoPoint[][], overrides: Partial<ClosureCandidate> = {}): ClosureCandidate {
  return {
    id: 'c1',
    kind: 'full',
    description: 'M6 northbound carriageway closure',
    startsAt: new Date('2026-11-02T20:00:00.000Z'),
    endsAt: new Date('2026-11-03T06:00:00.000Z'),
    position: lines[0]![0]!,
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

  it('keeps the places along the route where it runs along the closure, in order', () => {
    const [placed] = placeClosuresOnRoute(route, [closure([northSouth(53.34, 53.35)])]);
    expect(placed!.matchedM.length).toBeGreaterThan(5);
    expect([...placed!.matchedM].sort((a, b) => a - b)).toEqual(placed!.matchedM);
    expect(placed!.matchedM[0]).toBe(placed!.fromM);
    expect(placed!.matchedM[placed!.matchedM.length - 1]).toBe(placed!.toM);
  });

  it('ignores a closure on the other carriageway: the same place, the other way', () => {
    expect(placeClosuresOnRoute(route, [closure([northSouth(53.35, 53.34)])])).toEqual([]);
  });

  it('ignores a parallel road 100 m away', () => {
    const beside = closure([northSouth(53.34, 53.35, LON + 0.0015)]);
    expect(placeClosuresOnRoute(route, [beside])).toEqual([]);
  });

  it('ignores a road that crosses the route', () => {
    const across: GeoPoint[] = Array.from({ length: 21 }, (_, i) => ({
      lat: 53.35,
      lon: LON - 0.01 + i * 0.001,
    }));
    expect(placeClosuresOnRoute(route, [closure([across])])).toEqual([]);
  });

  it('ignores a slip road the route only passes, and places one it takes', () => {
    // A slip road leaves the main road heading the same way for 300 m, then bends away.
    const slip: GeoPoint[] = [
      { lat: 53.35, lon: LON },
      { lat: 53.351, lon: LON },
      { lat: 53.352, lon: LON },
      { lat: 53.353, lon: LON + 0.0006 },
      { lat: 53.354, lon: LON + 0.002 },
      { lat: 53.3545, lon: LON + 0.004 },
    ];
    expect(placeClosuresOnRoute(route, [closure([slip])])).toEqual([]);

    const viaSlip = indexRoute([...northSouth(53.3, 53.349), ...slip]);
    expect(ids(placeClosuresOnRoute(viaSlip, [closure([slip])]))).toEqual(['c1']);
  });

  it('places a long closure the route joins part-way along', () => {
    const long = closure([northSouth(53.32, 53.38)]);
    const joins = indexRoute(northSouth(53.34, 53.4));
    expect(ids(placeClosuresOnRoute(joins, [long]))).toEqual(['c1']);
  });

  it('does not place a long closure the route only touches', () => {
    const long = closure([northSouth(53.32, 53.38)]);
    const touches = indexRoute(northSouth(53.378, 53.4));
    expect(placeClosuresOnRoute(touches, [long])).toEqual([]);
  });

  it('takes every line of a closure, in whatever order, each going its own way', () => {
    // Listed last piece first, as the feed does: the pieces are still each drawn in the direction of travel.
    const pieces = [northSouth(53.345, 53.35), northSouth(53.34, 53.345)];
    expect(ids(placeClosuresOnRoute(route, [closure(pieces)]))).toEqual(['c1']);
  });

  it('puts the closures in the order the route meets them', () => {
    const later = closure([northSouth(53.37, 53.38)], { id: 'later' });
    const earlier = closure([northSouth(53.32, 53.33)], { id: 'earlier' });
    expect(ids(placeClosuresOnRoute(route, [later, earlier]))).toEqual(['earlier', 'later']);
  });

  it('has nothing to place on a route of one point', () => {
    expect(placeClosuresOnRoute(indexRoute([{ lat: 53.3, lon: LON }]), [closure([[]])])).toEqual(
      [],
    );
  });
});

describe('closuresAtArrival', () => {
  /** A closure on the 53.34 to 53.35 stretch, 4 to 5 km along an 11 km, 11 minute drive. */
  const [placed] = placeClosuresOnRoute(route, [closure([northSouth(53.34, 53.35)])]);
  const trip = (departAt: Date) => ({ departAt, durationMin: 11 });

  it('has a closure in force when the driver gets there', () => {
    const [found] = closuresAtArrival([placed!], trip(T0));
    expect(found).toBeDefined();
    expect(found!.arrivesAt.getTime() - T0.getTime()).toBeCloseTo(4.4 * 60_000, -4);
    expect(found!.mayBeOpen).toBe(false);
  });

  it('leaves out one that has ended well before the driver gets there', () => {
    const departAt = new Date('2026-11-03T08:00:00.000Z');
    expect(closuresAtArrival([placed!], trip(departAt))).toEqual([]);
  });

  it('leaves out one that starts well after the driver has passed', () => {
    const departAt = new Date('2026-11-02T16:00:00.000Z');
    expect(closuresAtArrival([placed!], trip(departAt))).toEqual([]);
  });

  it('allows for the arrival time being a little out, in both directions', () => {
    const justBefore = new Date('2026-11-02T19:35:00.000Z'); // arrives 19:39, starts 20:00
    expect(closuresAtArrival([placed!], trip(justBefore))).toHaveLength(1);
    const justAfter = new Date('2026-11-03T05:40:00.000Z'); // arrives 05:44, ended 06:00
    expect(closuresAtArrival([placed!], trip(justAfter))).toHaveLength(1);
  });

  it('says a closure with a window of days may not be shut at the time', () => {
    const [week] = placeClosuresOnRoute(route, [
      closure([northSouth(53.34, 53.35)], { endsAt: new Date('2026-11-09T06:00:00.000Z') }),
    ]);
    const [found] = closuresAtArrival([week!], trip(T0));
    expect(found!.mayBeOpen).toBe(true);
    expect(mustAvoid(found!)).toBe(false);
  });
});

describe('mustAvoid', () => {
  const trip = { departAt: T0, durationMin: 11 };
  const inForce = (overrides: Partial<ClosureCandidate>) => {
    const [placed] = placeClosuresOnRoute(route, [closure([northSouth(53.34, 53.35)], overrides)]);
    return closuresAtArrival([placed!], trip)[0]!;
  };

  it('goes round a road that is shut', () => {
    expect(mustAvoid(inForce({}))).toBe(true);
  });

  it('does not go round a lane closure, which leaves the road open', () => {
    expect(mustAvoid(inForce({ kind: 'lane' }))).toBe(false);
  });
});

describe('lookAheadHours', () => {
  it('covers the drive, a tenth more and half an hour, in whole hours', () => {
    expect(lookAheadHours(60)).toBe(2);
    expect(lookAheadHours(300)).toBe(6);
    expect(lookAheadHours(301)).toBe(7);
  });

  it('is never less than an hour', () => {
    expect(lookAheadHours(1)).toBe(1);
  });
});
