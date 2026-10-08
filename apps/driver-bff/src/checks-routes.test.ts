import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerChecksRoutes } from './checks-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const ID = '33333333-3333-4333-8333-333333333333';
const TEMPLATE = '44444444-4444-4444-8444-444444444444';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerChecksRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const submission = {
  id: ID,
  templateId: TEMPLATE,
  vehicleId: 'lorry-1',
  answers: [{ itemId: 'tyres', value: 'ok' }],
};
const photo = { contentType: 'image/jpeg', dataBase64: 'AAAA' };

const cases = [
  ['GET', '/checks/mine', undefined],
  ['POST', '/checks', submission],
  ['PUT', `/checks/${ID}/photos/tyres`, photo],
] as const;

describe('checks routes', () => {
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
      coreClient.nextResponse = { status: 201, body: { relayed: true } };
      const response = await app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
        headers: AUTH,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ relayed: true });
      expect(coreClient.calls[0]).toMatchObject({
        method,
        path: url,
        authorization: `Bearer ${VALID_TOKEN}`,
      });
    },
  );

  it('400s a malformed check or photo locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [method, url, payload] of [
      ['POST', '/checks', { nonsense: true }],
      ['POST', '/checks', { ...submission, answers: 'ok' }],
      ['PUT', `/checks/${ID}/photos/tyres`, { contentType: 'text/plain', dataBase64: 'AAAA' }],
      ['PUT', `/checks/${ID}/photos/tyres`, { contentType: 'image/jpeg', dataBase64: '' }],
    ] as const) {
      const response = await app.inject({ method, url, payload, headers: AUTH });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});
