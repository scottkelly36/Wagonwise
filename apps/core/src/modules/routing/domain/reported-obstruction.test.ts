import { describe, expect, it } from 'vitest';
import { bufferPoint } from './geo.js';
import {
  ROAD_POINT_TOLERANCE_M,
  isOnRoute,
  type ReportedObstruction,
} from './reported-obstruction.js';

// A low bridge on a lane running north to south, mapped as a point of that lane.
const bridge = { lat: 53.9409815, lon: -1.091564 };
const METRES_PER_DEGREE_LAT = 111_320;
const north = (m: number) => ({ lat: bridge.lat + m / METRES_PER_DEGREE_LAT, lon: bridge.lon });
const east = (m: number) => ({
  lat: bridge.lat,
  lon: bridge.lon + m / (METRES_PER_DEGREE_LAT * Math.cos((bridge.lat * Math.PI) / 180)),
});

const mapped: ReportedObstruction = {
  id: 'osm-node',
  kind: 'height',
  limit: 3.35,
  zone: bufferPoint(bridge, 25),
  roadPoint: bridge,
};
const { roadPoint: _unused, ...reported } = { ...mapped, id: 'driver-report' };

describe('isOnRoute', () => {
  it('is on a route whose line has the mapped point: the road under the bridge', () => {
    expect(isOnRoute(mapped, [north(-120), bridge, north(90)])).toBe(true);
  });

  it('allows for the rounding of the route’s encoding', () => {
    expect(isOnRoute(mapped, [north(-120), east(0.2), north(90)])).toBe(true);
    expect(isOnRoute(mapped, [north(-120), east(ROAD_POINT_TOLERANCE_M - 0.5), north(90)])).toBe(
      true,
    );
  });

  it('is not on a route that crosses over it with no point there: the road on the bridge', () => {
    // Runs east to west straight over the point, its own points 40 m either side.
    expect(isOnRoute(mapped, [east(-40), east(40)])).toBe(false);
  });

  it('is not on a route whose nearest point is just past the tolerance', () => {
    expect(isOnRoute(mapped, [east(-40), east(ROAD_POINT_TOLERANCE_M + 1), east(40)])).toBe(false);
  });

  it('is not on an empty route', () => {
    expect(isOnRoute(mapped, [])).toBe(false);
  });

  it('always counts an obstruction with no mapped point (a driver’s report, an override): near is all that is known', () => {
    expect(isOnRoute(reported, [east(-40), east(40)])).toBe(true);
    expect(isOnRoute(reported, [])).toBe(true);
  });
});
