import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSosRoutes } from './sos-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const REQUEST = '33333333-3333-4333-8333-333333333333';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerSosRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const cases = [
  ['/sos/raise', { requestId: REQUEST, location: { lat: 54.97, lon: -2.1 } }],
  ['/sos/cancel', { requestId: REQUEST }],
] as const;

describe('sos routes', () => {
  it.each(cases)('POST %s needs a token, without calling core', async (url, payload) => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'POST', url, payload });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it.each(cases)(
    'POST %s forwards to core with the token, relaying it as it is',
    async (url, payload) => {
      const { app, coreClient } = buildApp();
      coreClient.nextResponse = { status: 200, body: { relayed: true } };
      const response = await app.inject({ method: 'POST', url, payload, headers: AUTH });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ relayed: true });
      expect(coreClient.calls[0]).toMatchObject({ method: 'POST', path: url });
    },
  );

  it.each(cases)('POST %s 400s a bad body without calling core', async (url) => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'POST', url, payload: {}, headers: AUTH });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});
