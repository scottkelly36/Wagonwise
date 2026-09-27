import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRoutingRoutes, type RoutingRouteDeps } from './routing-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  const deps: RoutingRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerRoutingRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('POST /routing/vehicle-profiles', () => {
  it('requires a Bearer token, without calling core at all', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('rejects a token the verifier rejects, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      headers: { authorization: 'Bearer not-valid' },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards a valid body and the original token to core, no driverId anywhere', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 201,
      body: { id: 'p1', driverId: 'driver-1', name: 'Big Wagon', dimensions },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls).toHaveLength(1);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/routing/vehicle-profiles',
      body: { name: 'Big Wagon', dimensions },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('GET /routing/vehicle-profiles', () => {
  it('forwards the token, no query string needed', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: [] };

    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/routing/vehicle-profiles',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });
});

describe('GET /routing/vehicle-profiles/:id', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('forwards the id in the path', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/routing/vehicle-profiles/${ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]?.path).toBe(`/routing/vehicle-profiles/${ID}`);
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles/not-a-uuid',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('PUT /routing/vehicle-profiles/:id', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('forwards the id and body, no driverId', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/routing/vehicle-profiles/${ID}`,
      payload: { name: 'Renamed', dimensions },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'PUT',
      path: `/routing/vehicle-profiles/${ID}`,
      body: { name: 'Renamed', dimensions },
    });
  });
});

describe('DELETE /routing/vehicle-profiles/:id', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('forwards the id', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };
    const response = await app.inject({
      method: 'DELETE',
      url: `/routing/vehicle-profiles/${ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'DELETE',
      path: `/routing/vehicle-profiles/${ID}`,
    });
  });
});

describe('POST /routing/route-plans', () => {
  const origin = { lat: 54.9707, lon: -2.1013 };
  const destination = { lat: 54.9738, lon: -2.0165 };
  const profileId = '11111111-1111-4111-8111-111111111111';

  it('forwards profileId/origin/destination and the token, no driverId', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 201, body: { id: 'plan-1' } };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/routing/route-plans',
      body: { profileId, origin, destination },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 422 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 422, body: { tag: 'NoRouteFound' } };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ tag: 'NoRouteFound' });
  });

  it('forwards an optional strategy field', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 201, body: { id: 'plan-1' } };

    await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin, destination, strategy: 'shortest' },
      headers: AUTH_HEADER,
    });

    expect(coreClient.calls[0]).toMatchObject({
      body: { profileId, origin, destination, strategy: 'shortest' },
    });
  });
});

describe('POST /routing/route-options/preview', () => {
  const origin = { lat: 54.9707, lon: -2.1013 };
  const destination = { lat: 54.9738, lon: -2.0165 };
  const profileId = '11111111-1111-4111-8111-111111111111';

  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { profileId, origin, destination },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards profileId/origin/destination and the token, no driverId', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { options: [] } };

    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { profileId, origin, destination },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/routing/route-options/preview',
      body: { profileId, origin, destination },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-options/preview',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('GET /routing/route-plans/:id', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('forwards the id and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { id: ID, driverId: 'driver-1' } };

    const response = await app.inject({
      method: 'GET',
      url: `/routing/route-plans/${ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: `/routing/route-plans/${ID}`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 404 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 404, body: { tag: 'RoutePlanNotFound' } };

    const response = await app.inject({
      method: 'GET',
      url: `/routing/route-plans/${ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ tag: 'RoutePlanNotFound' });
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/route-plans/not-a-uuid',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: `/routing/route-plans/${ID}` });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /routing/route-plans/:id/trip', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('forwards the plan id and token, no body', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 201, body: { id: 'trip-1', routePlanId: ID } };

    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${ID}/trip`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/routing/route-plans/${ID}/trip`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 409 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 409, body: { tag: 'TripAlreadyActive' } };

    const response = await app.inject({
      method: 'POST',
      url: `/routing/route-plans/${ID}/trip`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ tag: 'TripAlreadyActive' });
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/routing/route-plans/not-a-uuid/trip',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'POST', url: `/routing/route-plans/${ID}/trip` });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /routing/trips/:id/end', () => {
  const ID = '22222222-2222-4222-8222-222222222222';

  it('forwards the trip id and token, no body', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { id: ID, endedAt: '2026-06-15T09:00:00.000Z' },
    };

    const response = await app.inject({
      method: 'POST',
      url: `/routing/trips/${ID}/end`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/routing/trips/${ID}/end`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 404 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 404, body: { tag: 'ActiveTripNotFound' } };

    const response = await app.inject({
      method: 'POST',
      url: `/routing/trips/${ID}/end`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ tag: 'ActiveTripNotFound' });
  });
});

describe('GET /routing/trips/active', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/routing/trips/active' });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the token, relaying whatever core returns', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { trip: null } };

    const response = await app.inject({
      method: 'GET',
      url: '/routing/trips/active',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trip: null });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/routing/trips/active',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });
});
