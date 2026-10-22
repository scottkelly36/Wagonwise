import { congestionLines, sliceRoute } from './route-slice';

// A route running due east along the equator: 0.01 degrees is about 1,113 m, so the four vertices are 0, 1.1, 2.2 and 3.3 km along.
const route: [number, number][] = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
  [0.03, 0],
];

describe('sliceRoute', () => {
  it('cuts out the part between two fractions, starting and ending exactly where asked', () => {
    const slice = sliceRoute(route, 0.25, 0.75);
    expect(slice[0]![0]).toBeCloseTo(0.0075, 5);
    expect(slice.at(-1)![0]).toBeCloseTo(0.0225, 5);
    // The vertices between are kept.
    expect(slice.map((p) => Number(p[0].toFixed(4)))).toEqual([0.0075, 0.01, 0.02, 0.0225]);
  });

  it('is the whole route from 0 to 1, and a piece inside one segment is just two points', () => {
    expect(sliceRoute(route, 0, 1)).toEqual(route);
    const inside = sliceRoute(route, 0.4, 0.5);
    expect(inside).toHaveLength(2);
    expect(inside[0]![0]).toBeCloseTo(0.012, 5);
    expect(inside[1]![0]).toBeCloseTo(0.015, 5);
  });

  it('gives nothing for an empty or backwards stretch, or a route with no length', () => {
    expect(sliceRoute(route, 0.5, 0.5)).toEqual([]);
    expect(sliceRoute(route, 0.8, 0.2)).toEqual([]);
    expect(sliceRoute([[0, 0]], 0, 1)).toEqual([]);
    expect(
      sliceRoute(
        [
          [0, 0],
          [0, 0],
        ],
        0,
        1,
      ),
    ).toEqual([]);
  });

  it('keeps fractions outside 0 to 1 on the route', () => {
    expect(sliceRoute(route, -1, 2)).toEqual(route);
  });
});

describe('congestionLines', () => {
  it('cuts each stretch out with its level, and drops one too short to draw', () => {
    const lines = congestionLines(route, [
      { from: 0.1, to: 0.4, level: 'slow' },
      { from: 0.6, to: 0.6, level: 'heavy' },
      { from: 0.7, to: 1, level: 'heavy' },
    ]);
    expect(lines.map((l) => l.level)).toEqual(['slow', 'heavy']);
  });

  it('gives nothing before the route is known', () => {
    expect(congestionLines(undefined, [{ from: 0, to: 1, level: 'slow' }])).toEqual([]);
  });
});
