import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryCameraRepository } from '../application/testing/in-memory-camera-repository.js';
import { registerCameraRoutes } from './routes.js';

function buildApp() {
  const repo = new InMemoryCameraRepository();
  repo.cameras.push(
    { id: 'near', location: { lat: 54.97, lon: -2.1 }, kind: 'fixed', maxspeedMph: 40 },
    { id: 'red', location: { lat: 54.97, lon: -2.1 }, kind: 'red_light', maxspeedMph: undefined },
    { id: 'far', location: { lat: 55.5, lon: -2.1 }, kind: 'fixed', maxspeedMph: undefined },
  );
  const app = Fastify();
  registerCameraRoutes(app, { findNearbyCameras: { repo } });
  return app;
}

describe('POST /cameras/nearby', () => {
  it('returns the cameras around the point, with a limit only when the map gives one', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/cameras/nearby',
      payload: { corridor: [{ lat: 54.97, lon: -2.1 }], radiusM: 5000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cameras: [
        { id: 'near', location: { lat: 54.97, lon: -2.1 }, kind: 'fixed', maxspeedMph: 40 },
        { id: 'red', location: { lat: 54.97, lon: -2.1 }, kind: 'red_light' },
      ],
    });
  });

  it('400s a missing or empty corridor and a radius that is too big', async () => {
    const app = buildApp();
    for (const payload of [
      {},
      { corridor: [], radiusM: 5000 },
      { corridor: [{ lat: 54.97, lon: -2.1 }], radiusM: 500_000 },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/cameras/nearby', payload });
      expect(response.statusCode).toBe(400);
    }
  });
});
