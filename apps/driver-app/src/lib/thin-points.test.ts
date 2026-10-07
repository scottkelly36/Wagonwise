import { thinPoints } from './thin-points';

describe('thinPoints', () => {
  it('leaves a short list alone', () => {
    expect(thinPoints([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('keeps no more than the limit, including the first and last points', () => {
    const points = Array.from({ length: 10_001 }, (_, i) => i);
    const thinned = thinPoints(points, 1500);
    expect(thinned).toHaveLength(1500);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(10_000);
  });

  it('keeps the points in order and spaced evenly', () => {
    const thinned = thinPoints(
      Array.from({ length: 1000 }, (_, i) => i),
      11,
    );
    expect(thinned).toHaveLength(11);
    expect([...thinned].sort((x, y) => x - y)).toEqual(thinned);
    const gaps = thinned.slice(1).map((n, i) => n - (thinned[i] as number));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it('copes with a limit under two', () => {
    expect(thinPoints([1, 2, 3], 1)).toEqual([1]);
    expect(thinPoints([], 1)).toEqual([]);
  });
});
