import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';
import { registerWeatherRoutes } from './weather-routes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const body = { location: { lat: 54.95, lon: -2.2 } };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerWeatherRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('weather routes', () => {
  it('needs a token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/weather/warnings/at',
      payload: body,
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards to core with the token, relaying core as it is', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { warnings: [] } };
    const response = await app.inject({
      method: 'POST',
      url: '/weather/warnings/at',
      payload: body,
      headers: AUTH,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ warnings: [] });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/weather/warnings/at',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('400s a malformed body locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/weather/warnings/at',
      payload: { location: 'here' },
      headers: AUTH,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});
