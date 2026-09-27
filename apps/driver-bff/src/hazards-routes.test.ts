import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerHazardsRoutes, type HazardsRouteDeps } from './hazards-routes.js';
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
  const deps: HazardsRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerHazardsRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('POST /hazards/reports', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: { id: REPORT_ID, type: 'low_bridge', location, source: 'tap' },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the body and the original token, no reporterId anywhere', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { id: REPORT_ID, reporterId: 'driver-1', type: 'low_bridge', status: 'active' },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: { id: REPORT_ID, type: 'low_bridge', location, source: 'tap' },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/hazards/reports',
      body: { id: REPORT_ID, type: 'low_bridge', location, source: 'tap' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /hazards/reports/nearby', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the corridor, radius and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { hazards: [] } };

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [location], radiusM: 1000 },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/hazards/reports/nearby',
      body: { corridor: [location], radiusM: 1000 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on an empty corridor, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/nearby',
      payload: { corridor: [], radiusM: 1000 },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /hazards/voice-reports/parse', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: { transcript: 'low bridge ahead' },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the transcript and the original token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { type: 'low_bridge' } };

    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: { transcript: 'low bridge ahead' },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/hazards/voice-reports/parse',
      body: { transcript: 'low bridge ahead' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a missing transcript, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      payload: {},
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('GET /hazards/reports/:id', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: `/hazards/reports/${REPORT_ID}` });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the id and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { id: REPORT_ID, type: 'low_bridge' } };

    const response = await app.inject({
      method: 'GET',
      url: `/hazards/reports/${REPORT_ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: `/hazards/reports/${REPORT_ID}`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 404 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 404, body: { tag: 'HazardReportNotFound' } };

    const response = await app.inject({
      method: 'GET',
      url: `/hazards/reports/${REPORT_ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ tag: 'HazardReportNotFound' });
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/hazards/reports/not-a-uuid',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /hazards/reports/:id/confirm', () => {
  it('requires a Bearer token even though the domain has no ownership check', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/hazards/reports/${REPORT_ID}/confirm`,
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards to core once authenticated', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { confirmations: 1 } };

    const response = await app.inject({
      method: 'POST',
      url: `/hazards/reports/${REPORT_ID}/confirm`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/hazards/reports/${REPORT_ID}/confirm`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports/not-a-uuid/confirm',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('POST /hazards/reports/:id/dismiss', () => {
  it('forwards to core once authenticated', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { dismissals: 1 } };

    const response = await app.inject({
      method: 'POST',
      url: `/hazards/reports/${REPORT_ID}/dismiss`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/hazards/reports/${REPORT_ID}/dismiss`,
    });
  });
});

describe('DELETE /hazards/reports/:id', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'DELETE', url: `/hazards/reports/${REPORT_ID}` });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards to core once authenticated, whatever core decides', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };

    const response = await app.inject({
      method: 'DELETE',
      url: `/hazards/reports/${REPORT_ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'DELETE',
      path: `/hazards/reports/${REPORT_ID}`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 403 from core unchanged — this route has no opinion on who core lets through', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 403, body: { tag: 'Forbidden' } };

    const response = await app.inject({
      method: 'DELETE',
      url: `/hazards/reports/${REPORT_ID}`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ tag: 'Forbidden' });
  });

  it('400s a non-UUID id before even checking for a token', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/hazards/reports/not-a-uuid',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('GET /hazards/reports', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/hazards/reports' });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the token and relays the list', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { hazards: [] } };

    const response = await app.inject({
      method: 'GET',
      url: '/hazards/reports',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/hazards/reports',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 403 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 403, body: { tag: 'Forbidden' } };

    const response = await app.inject({
      method: 'GET',
      url: '/hazards/reports',
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(403);
  });
});
