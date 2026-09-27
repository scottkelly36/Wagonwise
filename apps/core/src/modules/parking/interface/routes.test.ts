import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryParkingRepository } from '../application/testing/in-memory-parking-repository.js';
import { registerParkingRoutes, type ParkingRouteDeps } from './routes.js';

const location = { lat: 54.9707, lon: -2.1013 };
const now = new Date('2026-06-15T08:00:00.000Z');

// Same stand-in as congestion's routes.test.ts: `reporterId` comes from `request.driverId`
// (host/driver-auth.ts's hook), never a body field — a plain test header stands in for that hook
// here, since driver-auth.test.ts already exercises the hook itself against real verification.
const DRIVER_HEADER = 'x-test-driver-id';

function buildApp(): { app: FastifyInstance; deps: ParkingRouteDeps } {
  const repo = new InMemoryParkingRepository();
  const clock = new FakeClock(now);
  const deps: ParkingRouteDeps = {
    reportSafeParkingSpot: { repo, clock },
    findNearbyParking: { repo },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
  registerParkingRoutes(app, deps);
  return { app, deps };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /parking/spots', () => {
  it('200s and returns the created spot', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        location,
        note: 'flat layby, room for a 44-tonner',
      },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reporterId: 'driver-1',
      note: 'flat layby, room for a 44-tonner',
    });
  });

  it('200s with no note', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: '11111111-1111-4111-8111-111111111111', location },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: '11111111-1111-4111-8111-111111111111', location },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a note too long, caught by the zod schema before the use case runs', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: '11111111-1111-4111-8111-111111111111', location, note: 'x'.repeat(281) },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /parking/spots/nearby', () => {
  it('200s with spots near a single point', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: '11111111-1111-4111-8111-111111111111', location },
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ spots: [{ reporterId: 'driver-1' }] });
  });

  it('omits a spot outside the radius', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: '11111111-1111-4111-8111-111111111111', location },
      ...asDriver('driver-1'),
    });

    const farAway = { lat: location.lat + 5, lon: location.lon + 5 };
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [farAway], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ spots: [] });
  });

  it('400s an empty corridor', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a non-positive radius', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 0 },
    });
    expect(response.statusCode).toBe(400);
  });
});
