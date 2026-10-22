import type { RouteCameraDto } from '@wagonwise/contracts/routing';

import {
  cameraOffsets,
  cameraWarningText,
  CAMERA_WARNING_AHEAD_M,
  nextCameraAhead,
} from './camera-ahead';

// A route running due east along the equator: 0.01 degrees is about 1,113 m.
const routeLine: [number, number][] = [
  [0, 0],
  [0.01, 0],
  [0.02, 0],
  [0.03, 0],
];

const cam = (id: string, lon: number, kind: RouteCameraDto['kind'] = 'fixed'): RouteCameraDto => ({
  id,
  location: { lat: 0, lon },
  kind,
});

describe('cameraOffsets', () => {
  it('places each camera along the route, nearest the start first', () => {
    const offsets = cameraOffsets(routeLine, [cam('b', 0.02), cam('a', 0.005)]);
    expect(offsets.map((o) => o.camera.id)).toEqual(['a', 'b']);
    expect(offsets[0]!.offsetM).toBeCloseTo(556, -1);
    expect(offsets[1]!.offsetM).toBeCloseTo(2226, -1);
  });
});

describe('nextCameraAhead', () => {
  const offsets = cameraOffsets(routeLine, [cam('a', 0.005), cam('b', 0.02)]);

  it('shows the next camera once it is within range, with how far', () => {
    const ahead = nextCameraAhead(offsets, 200, 0);
    expect(ahead?.camera.id).toBe('a');
    expect(ahead?.distanceM).toBeCloseTo(356, -1);
  });

  it('shows nothing while the next camera is further than the warning distance', () => {
    expect(nextCameraAhead(offsets, 0, 0, 300)).toBeUndefined();
    expect(CAMERA_WARNING_AHEAD_M).toBe(500);
  });

  it('moves on to the following camera once the first is behind, and never goes back', () => {
    expect(nextCameraAhead(offsets, 1_900, 0)?.camera.id).toBe('b');
    expect(nextCameraAhead(offsets, 2_500, 0)).toBeUndefined();
  });

  it('shows nothing when the driver has left the route', () => {
    expect(nextCameraAhead(offsets, 200, 200)).toBeUndefined();
  });

  it('shows nothing for a route with no cameras', () => {
    expect(nextCameraAhead([], 200, 0)).toBeUndefined();
  });
});

describe('cameraWarningText', () => {
  it('says what kind of camera', () => {
    expect(cameraWarningText(cam('a', 0))).toBe('Speed camera ahead');
    expect(cameraWarningText(cam('a', 0, 'average'))).toBe('Average speed cameras ahead');
    expect(cameraWarningText(cam('a', 0, 'red_light'))).toBe('Red light camera ahead');
  });
});
