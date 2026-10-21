import { describe, expect, it } from 'vitest';
import type { SpeedCamera } from '../domain/speed-camera.js';
import { findNearbyCameras } from './find-nearby-cameras.js';
import { InMemoryCameraRepository } from './testing/in-memory-camera-repository.js';

const camera = (id: string, lat: number): SpeedCamera => ({
  id,
  location: { lat, lon: -2.1 },
  kind: 'fixed',
  maxspeedMph: undefined,
});

describe('findNearbyCameras', () => {
  it('returns the cameras within the radius of the route and leaves the rest', async () => {
    const repo = new InMemoryCameraRepository();
    repo.cameras.push(camera('on', 54.97), camera('far', 55.5));
    const found = await findNearbyCameras(
      { repo },
      { corridor: [{ lat: 54.97, lon: -2.1 }], radiusM: 12 },
    );
    expect(found.map((c) => c.id)).toEqual(['on']);
  });
});
