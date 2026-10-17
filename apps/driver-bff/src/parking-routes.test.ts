import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerParkingRoutes, type ParkingRouteDeps } from './parking-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const location = { lat: 54.9707, lon: -2.1013 };
const SPOT_ID = '11111111-1111-4111-8111-111111111111';

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  const deps: ParkingRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerParkingRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('POST /parking/spots', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: SPOT_ID, location },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the body and the original token, no reporterId anywhere', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { id: SPOT_ID, reporterId: 'driver-1', location },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: SPOT_ID, location, note: 'flat layby, room for a 44-tonner' },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/parking/spots',
      body: { id: SPOT_ID, location, note: 'flat layby, room for a 44-tonner' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /parking/spots/nearby', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the corridor, radius and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { spots: [] } };

    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [location], radiusM: 1000 },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/parking/spots/nearby',
      body: { corridor: [location], radiusM: 1000 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on an empty corridor, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/parking/spots/nearby',
      payload: { corridor: [], radiusM: 1000 },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('DELETE /parking/spots/:id', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'DELETE', url: `/parking/spots/${SPOT_ID}` });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the delete with the original token and relays core’s answer', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };

    const response = await app.inject({
      method: 'DELETE',
      url: `/parking/spots/${SPOT_ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'DELETE',
      path: `/parking/spots/${SPOT_ID}`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed id, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/parking/spots/not-a-uuid',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /parking/spots/:id/suggestions', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/parking/spots/${SPOT_ID}/suggestions`,
      payload: { name: 'New name' },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the suggested changes and the token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };
    const response = await app.inject({
      method: 'POST',
      url: `/parking/spots/${SPOT_ID}/suggestions`,
      payload: { name: 'New name', capacity: 12, showers: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/parking/spots/${SPOT_ID}/suggestions`,
      body: { name: 'New name', capacity: 12, showers: true },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s a bad id, an unknown field, or an out-of-range number, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [url, payload] of [
      ['/parking/spots/not-a-uuid/suggestions', { name: 'x' }],
      [`/parking/spots/${SPOT_ID}/suggestions`, { reporterId: 'me' }],
      [`/parking/spots/${SPOT_ID}/suggestions`, { capacity: -1 }],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload, headers: AUTH_HEADER });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /parking/spots with place details', () => {
  it('forwards the name, spaces and facilities, and 400s a bad number of spaces', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { id: SPOT_ID, reporterId: 'driver-1', location },
    };
    const ok = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: SPOT_ID, location, name: 'Corbridge Layby', capacity: 6, toilets: false },
      headers: AUTH_HEADER,
    });
    expect(ok.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      body: { id: SPOT_ID, location, name: 'Corbridge Layby', capacity: 6, toilets: false },
    });
    const bad = await app.inject({
      method: 'POST',
      url: '/parking/spots',
      payload: { id: SPOT_ID, location, capacity: -1 },
      headers: AUTH_HEADER,
    });
    expect(bad.statusCode).toBe(400);
  });
});
