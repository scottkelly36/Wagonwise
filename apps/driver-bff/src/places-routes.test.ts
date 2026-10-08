import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerPlacesRoutes } from './places-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const ID = '33333333-3333-4333-8333-333333333333';
const COMPANY = '11111111-1111-4111-8111-111111111111';
const location = { lat: 54.95, lon: -2.2 };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerPlacesRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const cases = [
  [
    'POST',
    '/places',
    { id: ID, companyId: COMPANY, category: 'farm', name: 'Smith Farm', location },
  ],
  ['POST', '/places/list', { companyId: COMPANY }],
  ['POST', '/places/nearby', { companyId: COMPANY, location, radiusM: 3000 }],
  ['PUT', `/places/${ID}`, { note: 'Gate on the left' }],
  ['DELETE', `/places/${ID}`, undefined],
] as const;

describe('places routes', () => {
  it.each(cases)('%s %s needs a token, without calling core', async (method, url, payload) => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it.each(cases)(
    '%s %s forwards to the same core path with the token, relaying core as it is',
    async (method, url, payload) => {
      const { app, coreClient } = buildApp();
      coreClient.nextResponse = { status: 200, body: { relayed: true } };
      const response = await app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
        headers: AUTH,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ relayed: true });
      expect(coreClient.calls[0]).toMatchObject({
        method,
        path: url,
        authorization: `Bearer ${VALID_TOKEN}`,
      });
    },
  );

  it('400s a malformed body or id locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [method, url, payload] of [
      ['POST', '/places', { nonsense: true }],
      ['POST', '/places/list', { companyId: 'not-a-company' }],
      ['POST', '/places/nearby', { companyId: COMPANY, location, radiusM: -1 }],
      ['PUT', `/places/${ID}`, {}],
      ['PUT', '/places/not-a-uuid', { note: 'x' }],
      ['DELETE', '/places/not-a-uuid', undefined],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
        headers: AUTH,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});
