import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryActiveTripRepository } from '../application/testing/in-memory-active-trip-repository.js';
import { InMemoryRoutePlanRepository } from '../application/testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from '../application/testing/in-memory-vehicle-profile-repository.js';
import { FakeHazardAvoidanceQuery } from '../application/testing/fake-hazard-avoidance-query.js';
import { FakeHazardsOnRouteQuery } from '../application/testing/fake-hazards-on-route-query.js';
import { FakeRestrictionOverrideRepository } from '../application/testing/fake-restriction-override-repository.js';
import { FakeRoutingEngine } from '../application/testing/fake-routing-engine.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './routes.js';

const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const now = new Date('2026-06-15T08:00:00.000Z');

// `driverId` comes from `request.driverId` (host/driver-auth.ts's hook, M4.2), never a body or
// query field. This test suite isn't exercising that hook — driver-auth.test.ts already does,
// against real verification — so it stands in for it with a trivial one keyed off a plain test
// header, letting every test below say who's calling without real token machinery.
const DRIVER_HEADER = 'x-test-driver-id';

function buildApp(): {
  app: FastifyInstance;
  deps: RoutingRouteDeps;
  routingEngine: FakeRoutingEngine;
} {
  const repo = new InMemoryVehicleProfileRepository();
  const ids = new SequentialIdGenerator();
  const routePlanRepo = new InMemoryRoutePlanRepository();
  const activeTripRepo = new InMemoryActiveTripRepository();
  const clock = new FakeClock(now);
  const routingEngine = new FakeRoutingEngine();
  const deps: RoutingRouteDeps = {
    createVehicleProfile: { repo, ids },
    updateVehicleProfile: { repo },
    deleteVehicleProfile: { repo },
    getVehicleProfile: { repo },
    listVehicleProfiles: { repo },
    planRoute: {
      vehicleProfileRepo: repo,
      routePlanRepo,
      routingEngine,
      hazardAvoidanceQuery: new FakeHazardAvoidanceQuery(),
      hazardsOnRouteQuery: new FakeHazardsOnRouteQuery(),
      restrictionOverrideRepo: new FakeRestrictionOverrideRepository(),
      clock,
      ids,
      fuelPricePerLitreGBP: 1.6,
    },
    previewRouteOptions: { vehicleProfileRepo: repo, routingEngine, fuelPricePerLitreGBP: 1.6 },
    getRoutePlan: { routePlanRepo },
    startTrip: { routePlanRepo, activeTripRepo, clock, ids },
    endTrip: { repo: activeTripRepo, clock },
    getActiveTrip: { activeTripRepo },
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
  return { app, deps, routingEngine };
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
      maneuvers: [],
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

  it('picks the shortest-distance alternative when strategy is "shortest"', async () => {
    const { app, routingEngine } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      ...asDriver('driver-1'),
    });
    const { id: profileId } = created.json<{ id: string }>();
    routingEngine.alternativesResult = {
      ok: true,
      value: [
        { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90, maneuvers: [] },
        { geometry: 'short-geometry', distanceKm: 80, durationMin: 110, maneuvers: [] },
      ],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination, strategy: 'shortest' },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ geometry: 'short-geometry', distanceKm: 80 });
  });
});

describe('POST /routing/route-options/preview', () => {
  it('200s with fastest/shortest options for an existing, owned profile', async () => {
    const { app, routingEngine } = buildApp();
    const created = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions, fuelConsumptionL100km: 30 },
      ...asDriver('driver-1'),
    });
    const { id: profileId } = created.json<{ id: string }>();
    routingEngine.alternativesResult = {
      ok: true,
      value: [
        { geometry: 'fast-geometry', distanceKm: 120, durationMin: 90, maneuvers: [] },
        { geometry: 'short-geometry', distanceKm: 80, durationMin: 110, maneuvers: [] },
      ],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { profileId, origin, destination },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      options: [
        {
          geometry: 'fast-geometry',
          distanceKm: 120,
          durationMin: 90,
          estimatedFuelCostGBP: 120 * 0.3 * 1.6,
          labels: ['fastest'],
        },
        {
          geometry: 'short-geometry',
          distanceKm: 80,
          durationMin: 110,
          estimatedFuelCostGBP: 80 * 0.3 * 1.6,
          labels: ['shortest'],
        },
      ],
    });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s an unknown profileId', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { profileId: '11111111-1111-4111-8111-111111111111', origin, destination },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'VehicleProfileNotFound' });
  });
});

const origin = { lat: 54.9707, lon: -2.1013 };
const destination = { lat: 54.9738, lon: -2.0165 };

async function planned(app: FastifyInstance, driverId = 'driver-1'): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/routing/vehicle-profiles',
    payload: { name: 'Big Wagon', dimensions },
    ...asDriver(driverId),
  });
  const { id: profileId } = created.json<{ id: string }>();

  const response = await app.inject({
    method: 'POST',
    url: '/routing/route-plans',
    payload: { profileId, origin, destination },
    ...asDriver(driverId),
  });
  return response.json<{ id: string }>().id;
}

describe('GET /routing/route-plans/:id', () => {
  it('200s and returns the plan for its owner', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);

    const response = await app.inject({
      method: 'GET',
      url: `/routing/route-plans/${routePlanId}`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: routePlanId, driverId: 'driver-1' });
  });

  it('404s an unknown id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/route-plans/11111111-1111-4111-8111-111111111111',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'RoutePlanNotFound' });
  });

  it('404s a plan owned by a different driver', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app, 'driver-1');

    const response = await app.inject({
      method: 'GET',
      url: `/routing/route-plans/${routePlanId}`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /routing/route-plans/:id/trip', () => {
  it('201s and returns the started trip for an owned plan', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);

    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ routePlanId, driverId: 'driver-1' });
  });

  it('404s an unknown route plan id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans/11111111-1111-4111-8111-111111111111/trip',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'RoutePlanNotFound' });
  });

  it('404s a plan owned by a different driver', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app, 'driver-1');

    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });

  it('409s a second trip while one is already active for the driver', async () => {
    const { app } = buildApp();
    const firstPlanId = await planned(app);
    await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${firstPlanId}/trip`,
      ...asDriver('driver-1'),
    });

    const secondPlanId = await planned(app);
    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${secondPlanId}/trip`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ tag: 'TripAlreadyActive' });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);
    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /routing/trips/:id/end', () => {
  it('200s and returns the ended trip', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);
    const started = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });
    const { id: tripId } = started.json<{ id: string }>();

    const response = await app.inject({
      method: 'POST',
      url: `/routing/trips/${tripId}/end`,
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: tripId });
    expect(response.json<{ endedAt?: string }>().endedAt).toBeDefined();
  });

  it('404s an unknown trip id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/trips/11111111-1111-4111-8111-111111111111/end',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'ActiveTripNotFound' });
  });

  it('404s a trip owned by a different driver', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app, 'driver-1');
    const started = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });
    const { id: tripId } = started.json<{ id: string }>();

    const response = await app.inject({
      method: 'POST',
      url: `/routing/trips/${tripId}/end`,
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /routing/trips/active', () => {
  it('200s with the trip when one is in progress', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);
    const started = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });
    const { id: tripId } = started.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: '/routing/trips/active',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ trip: { id: tripId, routePlanId } });
  });

  it('200s with trip: null when nothing is in progress', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/trips/active',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trip: null });
  });

  it("never returns another driver's active trip", async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app, 'driver-1');
    await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/routing/trips/active',
      ...asDriver('driver-2'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trip: null });
  });

  it('200s with trip: null again once the trip has ended', async () => {
    const { app } = buildApp();
    const routePlanId = await planned(app);
    const started = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${routePlanId}/trip`,
      ...asDriver('driver-1'),
    });
    const { id: tripId } = started.json<{ id: string }>();
    await app.inject({
      method: 'POST',
      url: `/routing/trips/${tripId}/end`,
      ...asDriver('driver-1'),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/routing/trips/active',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trip: null });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/routing/trips/active' });
    expect(response.statusCode).toBe(401);
  });
});
