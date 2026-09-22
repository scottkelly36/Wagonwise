import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryRoutePlanRepository } from '../application/testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from '../application/testing/in-memory-vehicle-profile-repository.js';
import { FakeHazardAvoidanceQuery } from '../application/testing/fake-hazard-avoidance-query.js';
import { FakeRoutingEngine } from '../application/testing/fake-routing-engine.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './routes.js';

const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const now = new Date('2026-06-15T08:00:00.000Z');

// `driverId` comes from `request.driverId` (host/driver-auth.ts's hook, M4.2), never a body or
// query field. This test suite isn't exercising that hook — driver-auth.test.ts already does,
// against real verification — so it stands in for it with a trivial one keyed off a plain test
// header, letting every test below say who's calling without real token machinery.
const DRIVER_HEADER = 'x-test-driver-id';

function buildApp(): { app: FastifyInstance; deps: RoutingRouteDeps } {
  const repo = new InMemoryVehicleProfileRepository();
  const ids = new SequentialIdGenerator();
  const deps: RoutingRouteDeps = {
    createVehicleProfile: { repo, ids },
    updateVehicleProfile: { repo },
    deleteVehicleProfile: { repo },
    getVehicleProfile: { repo },
    listVehicleProfiles: { repo },
    planRoute: {
      vehicleProfileRepo: repo,
      routePlanRepo: new InMemoryRoutePlanRepository(),
      routingEngine: new FakeRoutingEngine(),
      hazardAvoidanceQuery: new FakeHazardAvoidanceQuery(),
      clock: new FakeClock(now),
      ids,
    },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
  registerRoutingRoutes(app, deps);
  return { app, deps };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /routing/vehicle-profiles', () => {
  let app: FastifyInstance;
  beforeEach(() => ({ app } = buildApp()));

  it('201s and returns the created profile', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ driverId: 'driver-1', name: 'Big Wagon', dimensions });
  });

  it('401s with no authenticated driver', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('400s a malformed body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s invalid dimensions caught by the zod schema before the use case runs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions: { ...dimensions, heightM: 0 } },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /routing/vehicle-profiles', () => {
  it('200s the list scoped to the authenticated driver', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Mine', dimensions },
      ...asDriver('driver-1'),
    });
    await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Someone else’s', dimensions },
      ...asDriver('driver-2'),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ name: string }[]>();
    expect(body).toHaveLength(1);
    expect(body[0]?.name).toBe('Mine');
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/routing/vehicle-profiles' });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /routing/vehicle-profiles/:id', () => {
  it('200s the profile for its owner', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: `/routing/vehicle-profiles/${id}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Big Wagon' });
  });

  it('404s when the authenticated driver does not own it', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: `/routing/vehicle-profiles/${id}`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'VehicleProfileNotFound' });
  });

  it('400s a non-UUID id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles/not-a-uuid',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('PUT /routing/vehicle-profiles/:id', () => {
  it('200s and returns the updated profile', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Original', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'PUT',
      url: `/routing/vehicle-profiles/${id}`,
      payload: { name: 'Renamed', dimensions: { ...dimensions, heightM: 3.9 } },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Renamed' });
  });

  it('404s when updating a profile owned by a different driver', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Original', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'PUT',
      url: `/routing/vehicle-profiles/${id}`,
      payload: { name: 'Renamed', dimensions },
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('DELETE /routing/vehicle-profiles/:id', () => {
  it('204s and the profile is gone', async () => {
    const { app, deps } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/routing/vehicle-profiles/${id}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(204);
    expect(await deps.getVehicleProfile.repo.findById(makeId<'VehicleProfileId'>(id))).toBeNull();
  });

  it('404s when deleting a profile owned by a different driver', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'DELETE',
      url: `/routing/vehicle-profiles/${id}`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /routing/route-plans', () => {
  const origin = { lat: 54.9707, lon: -2.1013 };
  const destination = { lat: 54.9738, lon: -2.0165 };

  it('201s and returns the planned route for an existing, owned profile', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id: profileId } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      driverId: 'driver-1',
      profileId,
      geometry: 'fake-geometry',
      avoidedRestrictions: [],
      hazardsOnRoute: [],
    });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s an unknown profileId', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId: '11111111-1111-4111-8111-111111111111', origin, destination },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'VehicleProfileNotFound' });
  });

  it('404s a profile owned by a different driver', async () => {
    const { app } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id: profileId } = created.json<{ id: string }>();

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination },
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });

  it('422s when the routing engine reports NoRouteFound', async () => {
    const { app, deps } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id: profileId } = created.json<{ id: string }>();
    (deps.planRoute.routingEngine as FakeRoutingEngine).result = {
      ok: false,
      error: { tag: 'NoRouteFound' },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ tag: 'NoRouteFound' });
  });
});
