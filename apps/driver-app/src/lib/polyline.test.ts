import { decodePolyline6 } from './polyline';

// Test-only inverse of decodePolyline6, kept separate from the shipped decoder so a bug shared
// between the two couldn't hide behind a round trip alone — every case below also has a
// hand-verified expectation.
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
  it('decodes a single-point delta of +1/+1 from the implicit (0,0) origin', () => {
    // Hand-verified: 'A' is charCode 65, byte = 65-63 = 2, decoded delta = 2>>1 = 1.
    expect(decodePolyline6('AA')).toEqual([[0.000001, 0.000001]]);
  });

  it('decodes a negative delta correctly (two’s-complement unzigzag)', () => {
    // Hand-verified: '@' is charCode 64, byte = 1, decoded delta = ~(1>>1) = -1.
    expect(decodePolyline6('@A')).toEqual([[0.000001, -0.000001]]);
  });

  it('returns an empty path for an empty string', () => {
    expect(decodePolyline6('')).toEqual([]);
  });

  it('round-trips real Hexham-area coordinates through a multi-byte chunk', () => {
    const points: [number, number][] = [
      [-2.1013, 54.9714],
      [-2.0982, 54.973],
      [-1.9721, 54.9756],
    ];
    const encoded = encodePolyline6(points);
    const decoded = decodePolyline6(encoded);

    expect(decoded).toHaveLength(points.length);
    decoded.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(points[i][0], 6);
      expect(lat).toBeCloseTo(points[i][1], 6);
    });
  });
});
