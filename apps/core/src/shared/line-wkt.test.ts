import { describe, expect, it } from 'vitest';
import { lineWkt } from './line-wkt.js';

describe('lineWkt', () => {
  it('writes longitude first, as PostGIS expects', () => {
    expect(
      lineWkt([
        { lat: 54.9707, lon: -2.1013 },
        { lat: 54.9738, lon: -2.0165 },
      ]),
    ).toBe('SRID=4326;LINESTRING(-2.1013 54.9707,-2.0165 54.9738)');
  });

  it('handles a very long line in one value', () => {
    const points = Array.from({ length: 200_000 }, (_, i) => ({ lat: 50 + i * 1e-5, lon: -2 }));
    const wkt = lineWkt(points);
    expect(wkt.startsWith('SRID=4326;LINESTRING(')).toBe(true);
    expect(wkt.split(',')).toHaveLength(200_000);
  });

  it('refuses a coordinate that is not a finite number', () => {
    expect(() => lineWkt([{ lat: Number.NaN, lon: 0 }])).toThrow(/non-finite/);
    expect(() => lineWkt([{ lat: 0, lon: Number.POSITIVE_INFINITY }])).toThrow(/non-finite/);
  });
});
