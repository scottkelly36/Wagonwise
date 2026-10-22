import type { RouteCameraDto } from '@wagonwise/contracts/routing';

import { cameraMarkers } from './camera-markers';

const mapCamera = (id: string, lat: number, lon: number): RouteCameraDto => ({
  id,
  location: { lat, lon },
  kind: 'fixed',
});

describe('cameraMarkers', () => {
  it('draws the map-data cameras along the route', () => {
    const markers = cameraMarkers([mapCamera('a', 54.97, -2.1), mapCamera('b', 54.98, -2.09)], []);
    expect(markers.map((m) => [m.id, m.mobile, m.hazardId])).toEqual([
      ['map-a', false, undefined],
      ['map-b', false, undefined],
    ]);
  });

  it('draws the cameras drivers marked, taking the report so it can be opened, and leaves other hazards out', () => {
    const markers = cameraMarkers(undefined, [
      { id: 'h1', type: 'speed_camera', location: { lat: 54.97, lon: -2.1 } },
      { id: 'h2', type: 'mobile_camera', location: { lat: 54.98, lon: -2.09 } },
      { id: 'h3', type: 'low_bridge', location: { lat: 54.99, lon: -2.08 } },
    ]);
    expect(markers.map((m) => [m.hazardId, m.mobile])).toEqual([
      ['h1', false],
      ['h2', true],
    ]);
  });

  it('draws one marker, the tappable one, where a driver has marked a camera the map data also has', () => {
    const markers = cameraMarkers(
      [mapCamera('a', 54.97, -2.1), mapCamera('b', 54.98, -2.09)],
      [{ id: 'h1', type: 'speed_camera', location: { lat: 54.97001, lon: -2.1 } }],
    );
    expect(markers.map((m) => m.id)).toEqual(['map-b', 'reported-h1']);
  });

  it('keeps a map-data camera when what a driver marked there is a mobile one', () => {
    const markers = cameraMarkers(
      [mapCamera('a', 54.97, -2.1)],
      [{ id: 'h2', type: 'mobile_camera', location: { lat: 54.97001, lon: -2.1 } }],
    );
    expect(markers).toHaveLength(2);
  });

  it('is empty before anything has loaded', () => {
    expect(cameraMarkers(undefined, undefined)).toEqual([]);
  });
});
