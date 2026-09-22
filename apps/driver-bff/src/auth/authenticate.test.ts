import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AccessTokenClaims, AccessTokenVerifier } from './access-token-verifier.js';
import { authenticateOrReject } from './authenticate.js';

const VALID_TOKEN = 'valid-token';
const CLAIMS: AccessTokenClaims = { driverId: 'driver-1', sessionId: 'session-1' };

function fakeVerifier(): AccessTokenVerifier {
  return {
    verify(token: string) {
      return token === VALID_TOKEN ? Promise.resolve(CLAIMS) : Promise.reject(new Error('bad'));
    },
  };
}

function makeApp(): FastifyInstance {
  const app = Fastify();
  app.get('/protected', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, fakeVerifier());
    if (token === undefined) return reply;
    return { token };
  });
  return app;
}

describe('authenticateOrReject', () => {
  it('401s with no Authorization header', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'missing_bearer_token' });
  });

  it('401s a token the verifier rejects', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not-valid' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'invalid_access_token' });
  });

  it('returns the raw token unchanged when it verifies', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ token: VALID_TOKEN });
  });
});
