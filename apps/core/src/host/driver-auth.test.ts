import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AccessTokenClaims, AccessTokenVerifier } from './access-token-verifier.js';
import { registerDriverAuth } from './driver-auth.js';

const VALID_TOKEN = 'valid-token';
const CLAIMS: AccessTokenClaims = { driverId: 'driver-1', sessionId: 'session-1' };

function fakeVerifier(): AccessTokenVerifier {
  return {
    verify(token: string) {
      if (token !== VALID_TOKEN) {
        return Promise.reject(new Error('bad token'));
      }
      return Promise.resolve(CLAIMS);
    },
  };
}

function makeApp(): FastifyInstance {
  const app = Fastify();
  registerDriverAuth(app, fakeVerifier(), ['/routing/', '/hazards/']);
  app.get('/routing/vehicle-profiles', (request) => ({
    driverId: request.driverId,
    sessionId: request.sessionId,
  }));
  app.get('/hazards/reports', (request) => ({ driverId: request.driverId }));
  app.get('/identity/otp/request', () => 'never reached');
  app.get('/health', () => 'ok');
  return app;
}

describe('registerDriverAuth', () => {
  it('rejects a routing request with no Authorization header', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/routing/vehicle-profiles' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'missing_bearer_token' });
  });

  it('rejects a routing request with a non-Bearer Authorization header', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      headers: { authorization: `Basic ${VALID_TOKEN}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'missing_bearer_token' });
  });

  it('rejects a routing request with a token the verifier rejects', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      headers: { authorization: 'Bearer not-the-valid-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'invalid_access_token' });
  });

  it('accepts a valid token on a routing route and exposes the claims on the request', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/routing/vehicle-profiles',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(CLAIMS);
  });

  it('accepts a valid token on a hazards route too', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/hazards/reports',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ driverId: CLAIMS.driverId });
  });

  it('does not gate identity routes — they run before any access token exists', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/identity/otp/request' });
    expect(response.statusCode).toBe(200);
  });

  it('does not gate /health', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('only gates the prefixes it is given — a module not listed stays ungated', async () => {
    const app = Fastify();
    registerDriverAuth(app, fakeVerifier(), ['/routing/']);
    app.get('/hazards/reports', (request) => ({ driverId: request.driverId ?? null }));

    const response = await app.inject({ method: 'GET', url: '/hazards/reports' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ driverId: null });
  });

  it('gates the bare path itself for a trailing-slash prefix, not only a sub-path under it (regression, M6.5)', async () => {
    // `POST /identity/devices` is registered under the prefix `/identity/devices/` — with a
    // trailing slash, since that's this codebase's own convention for gating a whole module
    // (`/routing/`, `/hazards/`, `/feedback/`). But the real route's URL is the bare path with no
    // trailing slash at all, which `startsWith('/identity/devices/')` alone never matches — the
    // route ran completely unauthenticated in production until this was caught by actually
    // driving it end to end (M6.5), not by a test, since every prior test used a `/…/protected`
    // sub-path fixture that always had the extra segment this bug needed to hide behind.
    const app = Fastify();
    registerDriverAuth(app, fakeVerifier(), ['/identity/devices/']);
    app.post('/identity/devices', (request) => ({ driverId: request.driverId ?? null }));

    const withoutToken = await app.inject({ method: 'POST', url: '/identity/devices' });
    expect(withoutToken.statusCode).toBe(401);
    expect(withoutToken.json()).toMatchObject({ error: 'missing_bearer_token' });

    const withToken = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(withToken.statusCode).toBe(200);
    expect(withToken.json()).toEqual({ driverId: CLAIMS.driverId });
  });
});
