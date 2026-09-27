import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './companies-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'admin-driver', sessionId: 'session-1' });
  const app = Fastify();
  const deps: CompaniesRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerCompaniesRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

describe('POST /companies', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: COMPANY_ID, name: 'Acme Haulage' },
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the body and the original token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 201,
      body: { id: COMPANY_ID, name: 'Acme Haulage', createdAt: '2026-09-27T08:00:00.000Z' },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: COMPANY_ID, name: 'Acme Haulage' },
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/companies',
      body: { id: COMPANY_ID, name: 'Acme Haulage' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on an empty name, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: COMPANY_ID, name: '' },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('relays a 403 from core unchanged — this route has no opinion on who core lets through', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 403, body: { tag: 'Forbidden' } };

    const response = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { id: COMPANY_ID, name: 'Acme Haulage' },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ tag: 'Forbidden' });
  });
});

describe('GET /companies', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/companies' });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the token and relays the list', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { companies: [] } };

    const response = await app.inject({
      method: 'GET',
      url: '/companies',
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/companies',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });
});
