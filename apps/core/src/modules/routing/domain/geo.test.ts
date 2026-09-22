import { describe, expect, it } from 'vitest';
import { bufferPoint, decodePolyline } from './geo.js';
import type { GeoPoint } from './geo.js';

/** Test-only encoder, the inverse of `decodePolyline` — used to build known-good polyline6
 *  strings to round-trip against, since real routes only exist behind a live Valhalla instance
 *  (golden-route tests, M2.6). Not exported: production code only ever decodes Valhalla's output,
 *  never encodes. */
function encodePolyline(points: GeoPoint[], precision = 6): string {
  const factor = 10 ** precision;
  let result = '';
  let prevLat = 0;
  let prevLon = 0;

  function encodeValue(value: number): string {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = '';
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    chunk += String.fromCharCode(v + 63);
    return chunk;
  }

  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lon = Math.round(point.lon * factor);
    result += encodeValue(lat - prevLat);
    result += encodeValue(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return result;
}

describe('decodePolyline', () => {
  it('decodes the standard Google-maps reference example at precision 5', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(points).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it('round-trips real-looking coordinates at precision 6 (Valhalla’s default)', () => {
    const original: GeoPoint[] = [
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.9721, lon: -2.0987 },
      { lat: 54.9738, lon: -2.0165 },
    ];
    const encoded = encodePolyline(original, 6);
    expect(decodePolyline(encoded, 6)).toEqual(original);
  });

  it('defaults to precision 6', () => {
    const original: GeoPoint[] = [{ lat: 54.9707, lon: -2.1013 }];
    const encoded = encodePolyline(original, 6);
    expect(decodePolyline(encoded)).toEqual(original);
  });

  it('decodes an empty string to an empty array', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes a route with negative deltas (a real winding road, not just a straight line)', () => {
    const original: GeoPoint[] = [
      { lat: 54.98, lon: -2.11 },
      { lat: 54.975, lon: -2.115 },
      { lat: 54.972, lon: -2.108 },
      { lat: 54.9707, lon: -2.1013 },
    ];
    const encoded = encodePolyline(original, 6);
    expect(decodePolyline(encoded, 6)).toEqual(original);
  });
});

describe('bufferPoint', () => {
  it('returns a 4-point square centred on the point', () => {
    const point: GeoPoint = { lat: 54.9707, lon: -2.1013 };
    const zone = bufferPoint(point, 25);
    expect(zone.points).toHaveLength(4);
    const lats = zone.points.map((p) => p.lat);
    const lons = zone.points.map((p) => p.lon);
    expect(Math.min(...lats)).toBeLessThan(point.lat);
    expect(Math.max(...lats)).toBeGreaterThan(point.lat);
    expect(Math.min(...lons)).toBeLessThan(point.lon);
    expect(Math.max(...lons)).toBeGreaterThan(point.lon);
  });

  it('widens the longitude delta at higher latitude to keep a roughly square metre extent', () => {
    const low = bufferPoint({ lat: 10, lon: 0 }, 25);
    const high = bufferPoint({ lat: 60, lon: 0 }, 25);
    const lonSpread = (zone: typeof low): number =>
      Math.max(...zone.points.map((p) => p.lon)) - Math.min(...zone.points.map((p) => p.lon));
    expect(lonSpread(high)).toBeGreaterThan(lonSpread(low));
  });
});
