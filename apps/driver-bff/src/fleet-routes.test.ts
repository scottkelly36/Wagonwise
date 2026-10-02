import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerFleetRoutes } from './fleet-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const LINK_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerFleetRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('fleet routes', () => {
  it('require a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [method, url, payload] of [
      ['GET', '/fleet/links', undefined],
      ['POST', '/fleet/links/join', { code: 'ABCD-2345' }],
      ['POST', `/fleet/links/${LINK_ID}/respond`, { accept: true }],
      ['POST', `/fleet/links/${LINK_ID}/leave`, undefined],
    ] as const) {
      const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(response.statusCode).toBe(401);
    }
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards each call to core with the driver’s own token, relaying core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 201, body: { id: LINK_ID, status: 'requested' } };
    const joined = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'abcd-2345' },
      headers: AUTH_HEADER,
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toEqual({ id: LINK_ID, status: 'requested' });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/fleet/links/join',
      body: { code: 'abcd-2345' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });

    coreClient.nextResponse = { status: 429, body: { tag: 'TooManyAttempts' } };
    const blocked = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'ZZZZ2222' },
      headers: AUTH_HEADER,
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('validates the body and the id before calling core', async () => {
    const { app, coreClient } = buildApp();
    const noCode = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: {},
      headers: AUTH_HEADER,
    });
    const badId = await app.inject({
      method: 'POST',
      url: '/fleet/links/not-a-uuid/leave',
      headers: AUTH_HEADER,
    });
    const badAnswer = await app.inject({
      method: 'POST',
      url: `/fleet/links/${LINK_ID}/respond`,
      payload: { accept: 'yes' },
      headers: AUTH_HEADER,
    });
    expect([noCode.statusCode, badId.statusCode, badAnswer.statusCode]).toEqual([400, 400, 400]);
    expect(coreClient.calls).toEqual([]);
  });
});
