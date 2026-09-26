import { describe, expect, it } from 'vitest';
import { HazardsOnRouteQueryAdapter } from './hazards-on-route-query.js';

// The same encoder hazard-avoidance-query.test.ts uses, kept local for the same reason.
function encodePolyline(points: { lat: number; lon: number }[], precision = 6): string {
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
    result += encodeValue(lat - prevLat) + encodeValue(lon - prevLon);
    prevLat = lat;
    prevLon = lon;
  }
  return result;
}

describe('HazardsOnRouteQueryAdapter', () => {
  it('decodes the corridor and forwards it to findHazardIdsNear with the on-route radius', async () => {
    const points = [
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.9738, lon: -2.0165 },
    ];
    const calls: { corridor: unknown; radiusM: number }[] = [];
    const adapter = new HazardsOnRouteQueryAdapter({
      findHazardIdsNear(corridor, radiusM) {
        calls.push({ corridor, radiusM });
        return Promise.resolve([]);
      },
    });

    await adapter.idsNear(encodePolyline(points));

    expect(calls).toEqual([{ corridor: points, radiusM: 30 }]);
  });

  it('returns whatever ids findHazardIdsNear returns, unmodified', async () => {
    const adapter = new HazardsOnRouteQueryAdapter({
      findHazardIdsNear: () => Promise.resolve(['hazard-1', 'hazard-2']),
    });

    const result = await adapter.idsNear(encodePolyline([{ lat: 54.9707, lon: -2.1013 }]));

    expect(result).toEqual(['hazard-1', 'hazard-2']);
  });

  it('returns an empty array when there are no nearby hazards', async () => {
    const adapter = new HazardsOnRouteQueryAdapter({
      findHazardIdsNear: () => Promise.resolve([]),
    });
    expect(await adapter.idsNear(encodePolyline([{ lat: 0, lon: 0 }]))).toEqual([]);
  });
});
