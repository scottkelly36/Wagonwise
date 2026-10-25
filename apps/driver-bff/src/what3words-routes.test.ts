import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerWhat3wordsRoutes } from './what3words-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerWhat3wordsRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const cases = [
  ['/what3words/to-location', { words: 'filled.count.soap' }],
  ['/what3words/to-words', { location: { lat: 51.52, lon: -0.2 } }],
] as const;

describe('what3words routes', () => {
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
      coreClient.nextResponse = { status: 404, body: { tag: 'WordsNotFound' } };
      const response = await app.inject({ method: 'POST', url, payload, headers: AUTH });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ tag: 'WordsNotFound' });
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
