import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerFleetRoutes, type FleetRouteDeps } from './fleet-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
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
  const deps: FleetRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerFleetRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('GET /fleet/companies/:companyId/vehicles', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${COMPANY_ID}/vehicles`,
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the companyId and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { vehicles: [] } };

    const response = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${COMPANY_ID}/vehicles`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: `/fleet/companies/${COMPANY_ID}/vehicles`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('relays a 403 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 403, body: { tag: 'Forbidden' } };

    const response = await app.inject({
      method: 'GET',
      url: `/fleet/companies/${COMPANY_ID}/vehicles`,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('POST /fleet/companies/:companyId/vehicles', () => {
  it('forwards the body and token, no id field', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 201, body: { id: VEHICLE_ID } };

    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${COMPANY_ID}/vehicles`,
      payload: { companyId: COMPANY_ID, name: 'Big Wagon', dimensions },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/fleet/companies/${COMPANY_ID}/vehicles`,
      body: { companyId: COMPANY_ID, name: 'Big Wagon', dimensions },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/fleet/companies/${COMPANY_ID}/vehicles`,
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('PUT /fleet/vehicles/:id', () => {
  it('forwards the body and token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { id: VEHICLE_ID } };

    const response = await app.inject({
      method: 'PUT',
      url: `/fleet/vehicles/${VEHICLE_ID}`,
      payload: { name: 'Renamed', dimensions },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'PUT',
      path: `/fleet/vehicles/${VEHICLE_ID}`,
      body: { name: 'Renamed', dimensions },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });
});

describe('DELETE /fleet/vehicles/:id', () => {
  it('forwards the token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };

    const response = await app.inject({
      method: 'DELETE',
      url: `/fleet/vehicles/${VEHICLE_ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'DELETE',
      path: `/fleet/vehicles/${VEHICLE_ID}`,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });
});
