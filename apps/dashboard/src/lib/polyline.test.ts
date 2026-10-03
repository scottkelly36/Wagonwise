import { describe, expect, it } from 'vitest';

import { decodePolyline6 } from './polyline';

// Test-only inverse of decodePolyline6, kept separate from the shipped decoder so a bug shared
// between the two couldn't hide behind a round trip alone.
function encodeSignedValue(value: number): string {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let chars = '';
  while (shifted >= 0x20) {
    chars += String.fromCharCode((shifted & 0x1f) + 0x20 + 63);
    shifted >>= 5;
  }
  chars += String.fromCharCode(shifted + 63);
  return chars;
}

function encodePolyline6(points: [lon: number, lat: number][]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLon = 0;
  for (const [lon, lat] of points) {
    const latValue = Math.round(lat * 1e6);
    const lonValue = Math.round(lon * 1e6);
    encoded += encodeSignedValue(latValue - prevLat) + encodeSignedValue(lonValue - prevLon);
    prevLat = latValue;
    prevLon = lonValue;
  }
  return encoded;
}

describe('decodePolyline6', () => {
  it('decodes a single-point delta of +1/+1 from the implicit origin', () => {
    // Hand-verified: 'A' is charCode 65, byte = 2, decoded delta = 2>>1 = 1.
    expect(decodePolyline6('AA')).toEqual([[0.000001, 0.000001]]);
  });

  it('decodes a negative delta (two’s-complement unzigzag)', () => {
    // Hand-verified: '@' is charCode 64, byte = 1, decoded delta = ~(1>>1) = -1.
    expect(decodePolyline6('@A')).toEqual([[0.000001, -0.000001]]);
  });

  it('round-trips a line across the North East as [lon, lat] pairs', () => {
    const line: [number, number][] = [
      [-2.1013, 54.9707],
      [-2.0165, 54.9738],
      [-1.6178, 54.9783],
    ];
    const decoded = decodePolyline6(encodePolyline6(line));
    expect(decoded).toHaveLength(3);
    decoded.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(line[i]?.[0] ?? NaN, 6);
      expect(lat).toBeCloseTo(line[i]?.[1] ?? NaN, 6);
    });
  });

  it('returns nothing for an empty line', () => {
    expect(decodePolyline6('')).toEqual([]);
  });
});
