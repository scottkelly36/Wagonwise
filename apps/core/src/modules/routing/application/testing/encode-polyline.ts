import type { GeoPoint } from '../../domain/geo.js';

/** Test-only inverse of `decodePolyline` (polyline6), for building route geometry in unit tests. */
export function encodePolyline(points: readonly GeoPoint[], precision = 6): string {
  const factor = 10 ** precision;
  let result = '';
  let prevLat = 0;
  let prevLon = 0;
  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = '';
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lon = Math.round(point.lon * factor);
    result += encodeValue(lat - prevLat) + encodeValue(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return result;
}
