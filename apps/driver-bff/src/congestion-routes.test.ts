import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCongestionRoutes, type CongestionRouteDeps } from './congestion-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const location = { lat: 54.9707, lon: -2.1013 };
const REPORT_ID = '11111111-1111-4111-8111-111111111111';

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  const deps: CongestionRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerCongestionRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('POST /congestion/reports', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { id: REPORT_ID, location, estimatedWaitMinutes: 15 },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the body and the original token, no reporterId anywhere', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { id: REPORT_ID, reporterId: 'driver-1', estimatedWaitMinutes: 15 },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { id: REPORT_ID, location, estimatedWaitMinutes: 15 },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/congestion/reports',
      body: { id: REPORT_ID, location, estimatedWaitMinutes: 15 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /congestion/reports/nearby', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the corridor, radius and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { reports: [] } };

    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/congestion/reports/nearby',
      body: { corridor: [location], radiusM: 1000 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on an empty corridor, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/congestion/reports/nearby',
      payload: { corridor: [], radiusM: 1000 },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});
