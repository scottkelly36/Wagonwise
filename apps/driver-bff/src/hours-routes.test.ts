import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerHoursRoutes } from './hours-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const COMPANY = '11111111-1111-4111-8111-111111111111';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerHoursRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const status = { state: 'driving', drivingLeftMin: 80, next: 'break' };
const cases = [
  ['GET', '/hours/sharing', undefined],
  ['PUT', `/hours/sharing/${COMPANY}`, { sharing: true, wordingVersion: 1 }],
  ['PUT', '/hours/status', status],
  ['DELETE', '/hours/status', undefined],
] as const;

describe('hours routes', () => {
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

  it('400s a malformed choice or status locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [method, url, payload] of [
      ['PUT', `/hours/sharing/${COMPANY}`, { sharing: 'yes' }],
      ['PUT', '/hours/status', { state: 'resting', drivingLeftMin: 5, next: 'break' }],
      ['PUT', '/hours/status', { state: 'driving', drivingLeftMin: -5, next: 'break' }],
      ['PUT', '/hours/status', { state: 'driving', drivingLeftMin: 5, next: 'soon' }],
    ] as const) {
      const response = await app.inject({ method, url, payload, headers: AUTH });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});
