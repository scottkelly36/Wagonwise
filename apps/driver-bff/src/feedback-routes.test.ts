import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerFeedbackRoutes, type FeedbackRouteDeps } from './feedback-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  const deps: FeedbackRouteDeps = { coreClient, accessTokenVerifier: verifier };
  registerFeedbackRoutes(app, deps);
  return { app, coreClient, verifier };
}

const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };
const payload = { message: 'Feedback', appVersion: '1.0.0', deviceInfo: 'ios 17.2' };

describe('POST /feedback/notes', () => {
  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'POST', url: '/feedback/notes', payload });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards the body and the original token, no driverId anywhere', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 201,
      body: { id: 'note-1', driverId: 'driver-1', ...payload },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(201);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/feedback/notes',
      body: payload,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s locally on a malformed body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: { nonsense: true },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('relays a 400 from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 400, body: { tag: 'InvalidMessage' } };

    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ tag: 'InvalidMessage' });
  });
});
