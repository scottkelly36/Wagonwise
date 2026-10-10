import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryParkingRepository } from '../application/testing/in-memory-parking-repository.js';
import { registerParkingRoutes, type ParkingRouteDeps } from './routes.js';

const location = { lat: 54.9707, lon: -2.1013 };
const now = new Date('2026-06-15T08:00:00.000Z');

// Same stand-in as congestion's routes.test.ts: `reporterId` comes from `request.driverId`
// (host/driver-auth.ts's hook), never a body field — a plain test header stands in for that hook
// here, since driver-auth.test.ts already exercises the hook itself against real verification.
const DRIVER_HEADER = 'x-test-driver-id';
const ADMIN = 'staff-admin';

function buildApp(): { app: FastifyInstance; deps: ParkingRouteDeps } {
  const repo = new InMemoryParkingRepository();
  const clock = new FakeClock(now);
  const deps: ParkingRouteDeps = {
    reportSafeParkingSpot: { repo, clock },
    findNearbyParking: { repo },
    deleteSafeParkingSpot: { repo },
    admin: { repo, ids: new SequentialIdGenerator(), clock },
    callerDirectory: {
      getCaller: (id) => Promise.resolve(id === ADMIN ? { kind: 'platform' } : null),
    },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    const staffId = request.headers['x-test-staff-id'];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
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

describe('DELETE /parking/spots/:id', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const mark = (app: FastifyInstance, driver: string) =>
    app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id, location },
      ...asDriver(driver),
    });

  it('204s when the reporter takes their own spot back, and it is gone', async () => {
    const { app } = buildApp();
    await mark(app, 'driver-1');
    const response = await app.inject({
      method: 'DELETE',
      url: `/parking/spots/${id}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(204);
    const nearby = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 500 },
      ...asDriver('driver-1'),
    });
    expect(nearby.json()).toEqual({ spots: [] });
  });

  it('404s for another driver’s spot, and leaves it', async () => {
    const { app } = buildApp();
    await mark(app, 'driver-1');
    const response = await app.inject({
      method: 'DELETE',
      url: `/parking/spots/${id}`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'SafeParkingSpotNotFound' });
    const nearby = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 500 },
      ...asDriver('driver-1'),
    });
    const body: { spots: unknown[] } = nearby.json();
    expect(body.spots).toHaveLength(1);
  });

  it('404s for a spot that does not exist', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/parking/spots/${id}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
  });

  it('401s with no authenticated driver, and 400s a malformed id', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'DELETE', url: `/parking/spots/${id}` })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/parking/spots/not-a-uuid',
          ...asDriver('driver-1'),
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('staff parking routes', () => {
  const as = (staffId: string) => ({ headers: { 'x-test-staff-id': staffId } });
  const payload = {
    location: { lat: 50.7, lon: -3.5 },
    name: 'Exeter Truckstop',
    capacity: 40,
    paid: true,
    toilets: true,
  };

  it('lets WagonWise staff add, list, change and delete a spot', async () => {
    const { app } = buildApp();
    const added = await app.inject({
      method: 'POST',
      url: '/staff/parking/spots',
      payload,
      ...as('staff-admin'),
    });
    expect(added.statusCode).toBe(201);
    const spot = added.json<{ id: string; source: string; name: string }>();
    expect(spot).toMatchObject({ source: 'admin', name: 'Exeter Truckstop' });

    const list = await app.inject({
      method: 'GET',
      url: '/staff/parking/spots',
      ...as('staff-admin'),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 1, bySource: { driver: 0, admin: 1, osm: 0 } });

    const changed = await app.inject({
      method: 'PUT',
      url: `/staff/parking/spots/${spot.id}`,
      payload: { ...payload, name: 'Exeter Services', showers: true },
      ...as('staff-admin'),
    });
    expect(changed.json()).toMatchObject({ name: 'Exeter Services', showers: true });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/staff/parking/spots/${spot.id}`,
      ...as('staff-admin'),
    });
    expect(deleted.statusCode).toBe(204);
    const gone = await app.inject({
      method: 'DELETE',
      url: `/staff/parking/spots/${spot.id}`,
      ...as('staff-admin'),
    });
    expect(gone.statusCode).toBe(404);
  });

  it('401s with no staff sign-in, 403s anyone but WagonWise staff, and 400s a bad request', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'GET', url: '/staff/parking/spots' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/staff/parking/spots', ...as('someone-else') }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/staff/parking/spots',
          payload,
          ...as('someone-else'),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/staff/parking/spots',
          payload: { location: { lat: 200, lon: 0 } },
          ...as('staff-admin'),
        })
      ).statusCode,
    ).toBe(400);
  });
});
