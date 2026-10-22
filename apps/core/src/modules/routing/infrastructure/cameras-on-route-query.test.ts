import { describe, expect, it } from 'vitest';
import { encodePolyline } from '../application/testing/encode-polyline.js';
import { CAMERA_ON_ROUTE_RADIUS_M } from '../domain/route-camera.js';
import { CamerasOnRouteQueryAdapter } from './cameras-on-route-query.js';

describe('CamerasOnRouteQueryAdapter', () => {
  it('asks for cameras near every point of the route, within the tight radius, and passes them on', async () => {
    const points = [
      { lat: 54.97, lon: -2.1 },
      { lat: 54.98, lon: -2.09 },
    ];
    let seen: { points: unknown; radiusM: number } | undefined;
    const adapter = new CamerasOnRouteQueryAdapter({
      findNear: (p, radiusM) => {
        seen = { points: p, radiusM };
        return Promise.resolve([
          { id: 'c1', location: points[0]!, kind: 'average' as const, maxspeedMph: 50 },
        ]);
      },
    });
    const cameras = await adapter.camerasNear(encodePolyline(points));
    expect(cameras).toEqual([{ id: 'c1', location: points[0], kind: 'average', maxspeedMph: 50 }]);
    expect(seen?.radiusM).toBe(CAMERA_ON_ROUTE_RADIUS_M);
    expect(seen?.points).toEqual(points);
  });
});
