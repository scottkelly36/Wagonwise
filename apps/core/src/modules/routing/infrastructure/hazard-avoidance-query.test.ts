import { describe, expect, it } from 'vitest';
import type { AvoidanceCandidate } from '../../hazards/api.js';
import { HazardAvoidanceQueryAdapter } from './hazard-avoidance-query.js';

// The same encoder geo.test.ts uses, kept local so this test doesn't depend on a decode/encode
// round trip elsewhere to build a fixture.
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

describe('HazardAvoidanceQueryAdapter', () => {
  it('decodes the corridor and forwards it to findAvoidanceCandidates with the on-route radius', async () => {
    const points = [
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.9738, lon: -2.0165 },
    ];
    const calls: { corridor: unknown; radiusM: number }[] = [];
    const adapter = new HazardAvoidanceQueryAdapter({
      findAvoidanceCandidates(corridor, radiusM) {
        calls.push({ corridor, radiusM });
        return Promise.resolve([]);
      },
    });

    await adapter.activeNear(encodePolyline(points));

    expect(calls).toEqual([{ corridor: points, radiusM: 30 }]);
  });

  it('translates a candidate into a ReportedObstruction with a buffered zone', async () => {
    const candidate: AvoidanceCandidate = {
      id: 'hazard-1',
      kind: 'height',
      limit: 3.5,
      location: { lat: 54.9707, lon: -2.1013 },
    };
    const adapter = new HazardAvoidanceQueryAdapter({
      findAvoidanceCandidates: () => Promise.resolve([candidate]),
    });

    const result = await adapter.activeNear(encodePolyline([{ lat: 54.9707, lon: -2.1013 }]));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'hazard-1', kind: 'height', limit: 3.5 });
    expect(result[0]?.zone.points).toHaveLength(4);
  });

  it('omits limit when the candidate has none', async () => {
    const candidate: AvoidanceCandidate = {
      id: 'hazard-2',
      kind: 'prohibition',
      location: { lat: 54.9707, lon: -2.1013 },
    };
    const adapter = new HazardAvoidanceQueryAdapter({
      findAvoidanceCandidates: () => Promise.resolve([candidate]),
    });

    const result = await adapter.activeNear(encodePolyline([{ lat: 54.9707, lon: -2.1013 }]));

    expect(result[0]).not.toHaveProperty('limit');
  });

  it('returns an empty array when there are no candidates', async () => {
    const adapter = new HazardAvoidanceQueryAdapter({
      findAvoidanceCandidates: () => Promise.resolve([]),
    });
    expect(await adapter.activeNear(encodePolyline([{ lat: 0, lon: 0 }]))).toEqual([]);
  });
});
