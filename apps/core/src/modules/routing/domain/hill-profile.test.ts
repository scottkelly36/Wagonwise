import { describe, expect, it } from 'vitest';

import { hillStats, type ElevationPoint } from './hill-profile.js';

/** A road 100 m between points, heights from a list of grades (percent) one per 100 m. */
function road(startM: number, grades: readonly number[]): ElevationPoint[] {
  const points: ElevationPoint[] = [{ distanceM: 0, heightM: startM }];
  for (const [i, grade] of grades.entries()) {
    points.push({ distanceM: (i + 1) * 100, heightM: points[i]!.heightM + grade });
  }
  return points;
}

describe('hillStats', () => {
  it('finds nothing steep on a flat road, and no climb', () => {
    const stats = hillStats(road(50, Array<number>(30).fill(0)));
    expect(stats).toMatchObject({ climbM: 0, highestPointM: 50, steepestPct: 0, steepKm: 0 });
    expect(stats.stretches).toEqual([]);
  });

  it('finds a sustained 8% climb as one stretch, with where it is', () => {
    // 1 km flat, 1 km at 8%, 1 km flat.
    const stats = hillStats(
      road(100, [
        ...Array<number>(10).fill(0),
        ...Array<number>(10).fill(8),
        ...Array<number>(10).fill(0),
      ]),
    );
    expect(stats.stretches).toHaveLength(1);
    expect(stats.stretches[0]!.gradePct).toBeCloseTo(8, 5);
    expect(stats.stretches[0]!.fromM).toBeGreaterThanOrEqual(500);
    expect(stats.stretches[0]!.toM).toBeLessThanOrEqual(2500);
    expect(stats.steepKm).toBeGreaterThan(1);
    expect(stats.highestPointM).toBeCloseTo(180, 5);
    expect(stats.climbM).toBeGreaterThan(70);
  });

  it('counts a steep descent as steep, too', () => {
    const stats = hillStats(road(300, Array<number>(10).fill(-9)));
    expect(stats.steepKm).toBeGreaterThan(0);
    expect(stats.steepestPct).toBeCloseTo(9, 5);
    expect(stats.climbM).toBe(0);
  });

  it('ignores a short spike that a 500 m view does not see as a hill', () => {
    // One 100 m step of 10 m: 10% over 100 m but only 2% over 500 m.
    const stats = hillStats(road(0, [0, 0, 0, 10, 0, 0, 0, 0, 0, 0]));
    expect(stats.steepKm).toBe(0);
    expect(stats.steepestPct).toBeLessThan(3);
  });

  it('keeps two separate hills as two stretches', () => {
    const stats = hillStats(
      road(0, [
        ...Array<number>(10).fill(7),
        ...Array<number>(20).fill(0),
        ...Array<number>(10).fill(7),
      ]),
    );
    expect(stats.stretches).toHaveLength(2);
  });

  it('says nothing about a route with no heights', () => {
    expect(hillStats([])).toEqual({
      climbM: 0,
      highestPointM: 0,
      steepestPct: 0,
      steepKm: 0,
      stretches: [],
    });
  });
});
