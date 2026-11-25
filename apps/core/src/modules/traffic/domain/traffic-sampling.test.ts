import { describe, expect, it } from 'vitest';
import { cellOf, sampleByCell, thinFar, type GeoPoint, type RouteSample } from './traffic.js';

const north = (from: number, to: number, step: number): GeoPoint[] =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => ({
    lat: from + i * step,
    lon: -2,
  }));

describe('cellOf', () => {
  it('puts points in the same cell when they are close, and in another when they cross a cell line', () => {
    expect(cellOf({ lat: 54.951, lon: -1.601 }, 0.05)).toBe(
      cellOf({ lat: 54.99, lon: -1.62 }, 0.05),
    );
    expect(cellOf({ lat: 54.99, lon: -1.6 }, 0.05)).not.toBe(
      cellOf({ lat: 55.01, lon: -1.6 }, 0.05),
    );
  });
});

describe('sampleByCell', () => {
  it('takes one sample for each cell the line passes through, the first at the start', () => {
    const line = north(55, 55.2, 0.02); // 0.05 degree cells: 55.00, 55.05, 55.10, 55.15 (and the last point)
    const samples = sampleByCell(line, 0.05);
    expect(samples).toHaveLength(4); // the lone last point is not a cell of its own
    expect(samples[0]?.point).toEqual(line[0]);
  });

  it('gives each sample the length of road up to the next, and the lengths add up to the whole line', () => {
    const line = north(55, 55.2, 0.02);
    const samples = sampleByCell(line, 0.05);
    const total = samples.reduce((sum, s) => sum + s.lengthM, 0);
    expect(total).toBeGreaterThan(22_000);
    expect(total).toBeLessThan(22_500);
  });

  it('is the same cells however far along the lorry has got: dropping the start of the line only drops the first cells', () => {
    const line = north(55, 55.3, 0.01);
    const whole = sampleByCell(line, 0.05).map((s) => cellOf(s.point, 0.05));
    const later = sampleByCell(line.slice(12), 0.05).map((s) => cellOf(s.point, 0.05));
    expect(whole.slice(whole.length - later.length)).toEqual(later);
  });

  it('is nothing for an empty line and one sample for a single point', () => {
    expect(sampleByCell([], 0.05)).toEqual([]);
    expect(sampleByCell([{ lat: 55, lon: -2 }], 0.05)).toHaveLength(1);
  });
});

describe('thinFar', () => {
  const samples = (n: number, each = 5_000): RouteSample[] =>
    Array.from({ length: n }, (_, i) => ({
      point: { lat: 55 + i * 0.05, lon: -2 },
      lengthM: each,
    }));

  it('keeps every sample near the start, then one in each group beyond it, standing for the whole group', () => {
    const out = thinFar(samples(10), 20_000, 3);
    // The first four start inside 20 km and are kept; the last six are two groups of three.
    expect(out).toHaveLength(6);
    expect(out.slice(4).map((s) => s.lengthM)).toEqual([15_000, 15_000]);
  });

  it('keeps the whole length, so coverage is unchanged', () => {
    const before = samples(23);
    const after = thinFar(before, 30_000, 3);
    expect(after.reduce((sum, s) => sum + s.lengthM, 0)).toBe(
      before.reduce((sum, s) => sum + s.lengthM, 0),
    );
  });

  it('keeps a short last group, and does nothing when asked to keep every one', () => {
    expect(thinFar(samples(8), 5_000, 3).reduce((sum, s) => sum + s.lengthM, 0)).toBe(40_000);
    expect(thinFar(samples(8), 5_000, 1)).toHaveLength(8);
    expect(thinFar([], 5_000, 3)).toEqual([]);
  });
});
