import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerFuelRoutes } from './fuel-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const centre = { lat: 54.97, lon: -2.1 };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerFuelRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('POST /fuel/nearby', () => {
  it('forwards the request with its defaults filled in, and the original token, and relays the answer', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { fuelType: 'B7_STANDARD', stations: [] } };

    const response = await app.inject({
      method: 'POST',
      url: '/fuel/nearby',
      payload: { centre, radiusM: 10_000 },
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ fuelType: 'B7_STANDARD', stations: [] });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/fuel/nearby',
      body: { centre, radiusM: 10_000, fuelType: 'B7_STANDARD', limit: 20 },
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('requires a Bearer token and a valid body, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const anonymous = await app.inject({
      method: 'POST',
      url: '/fuel/nearby',
      payload: { centre, radiusM: 10_000 },
    });
    const bad = await app.inject({
      method: 'POST',
      url: '/fuel/nearby',
      payload: { centre, radiusM: 10_000, fuelType: 'LEADED' },
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(anonymous.statusCode).toBe(401);
    expect(bad.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });
});
