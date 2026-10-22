import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerCamerasRoutes } from './cameras-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const corridor = [{ lat: 54.97, lon: -2.1 }];

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerCamerasRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('POST /cameras/nearby', () => {
  it('forwards the point and the original token and relays the cameras', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { cameras: [{ id: 'c1', location: corridor[0], kind: 'fixed' }] },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/cameras/nearby',
      payload: { corridor, radiusM: 5000 },
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      cameras: [{ id: 'c1', location: corridor[0], kind: 'fixed' }],
    });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/cameras/nearby',
      body: { corridor, radiusM: 5000 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('requires a Bearer token and a valid body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const anonymous = await app.inject({
      method: 'POST',
      url: '/cameras/nearby',
      payload: { corridor, radiusM: 5000 },
    });
    const bad = await app.inject({
      method: 'POST',
      url: '/cameras/nearby',
      payload: { corridor: [], radiusM: 5000 },
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(anonymous.statusCode).toBe(401);
    expect(bad.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});
