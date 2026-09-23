import { describe, expect, it } from 'vitest';
import { loadConfig, PRODUCT_NAME } from '../config.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';
import { buildApp } from './build-app.js';

const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const INTERNAL_KEY_HEADER = { 'x-internal-key': 'local-dev-internal-key' };
const VALID_DRIVER_TOKEN = 'valid-driver-token';

const fakeAccessTokenVerifier: AccessTokenVerifier = {
  verify(token: string) {
    if (token !== VALID_DRIVER_TOKEN) {
      return Promise.reject(new Error('bad token'));
    }
    return Promise.resolve({ driverId: 'driver-1', sessionId: 'session-1' });
  },
};

function makeApp(overrides: Partial<Parameters<typeof loadConfig>[0]> = {}) {
  const clock = new FakeClock('2026-03-01T12:00:00.000Z');
  const ids = new SequentialIdGenerator();
  const app = buildApp({
    config: loadConfig({ LOG_LEVEL: 'silent', ...overrides }),
    clock,
    ids,
    accessTokenVerifier: fakeAccessTokenVerifier,
  });
  return { app, clock, ids };
}

describe('GET /health', () => {
  it('reports ok, and takes the time from the injected clock — no internal key needed', async () => {
    const { app } = makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'core',
      product: PRODUCT_NAME,
      time: '2026-03-01T12:00:00.000Z',
    });
  });

  it('follows the clock as it moves', async () => {
    const { app, clock } = makeApp();
    clock.advance(60_000);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json<{ time: string }>().time).toBe('2026-03-01T12:01:00.000Z');
  });
});

describe('internal-key auth', () => {
  it('rejects a request with no X-Internal-Key', async () => {
    const { app } = makeApp();
    app.get('/protected', () => 'never reached');
    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'invalid_internal_key', requestId: FIRST_ID });
  });

  it('rejects the wrong key', async () => {
    const { app } = makeApp();
    app.get('/protected', () => 'never reached');
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-internal-key': 'not-the-right-key' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts the configured key', async () => {
    const { app } = makeApp();
    app.get('/protected', () => ({ ok: true }));
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: INTERNAL_KEY_HEADER,
    });
    expect(response.statusCode).toBe(200);
  });

  it('accepts either of two configured keys, for rotation without downtime', async () => {
    const { app } = makeApp({ INTERNAL_KEYS: 'old-key,new-key' });
    app.get('/protected', () => ({ ok: true }));

    const withOld = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-internal-key': 'old-key' },
    });
    const withNew = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { 'x-internal-key': 'new-key' },
    });
    expect(withOld.statusCode).toBe(200);
    expect(withNew.statusCode).toBe(200);
  });

  it('does not need a key for /health specifically, but does for everything else', async () => {
    const { app } = makeApp();
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);

    const notFound = await app.inject({ method: 'GET', url: '/anything-else' });
    expect(notFound.statusCode).toBe(401); // gated before routing even decides it's a 404
  });
});

describe('driver auth (M4.2, M4.3)', () => {
  it.each([['/routing/protected'], ['/hazards/protected'], ['/feedback/protected']])(
    'rejects a %s request with no access token, even with a valid internal key',
    async (path) => {
      const { app } = makeApp();
      app.get(path, () => 'never reached');
      const response = await app.inject({
        method: 'GET',
        url: path,
        headers: INTERNAL_KEY_HEADER,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'missing_bearer_token' });
    },
  );

  it.each([['/routing/protected'], ['/hazards/protected'], ['/feedback/protected']])(
    'accepts a %s request with a valid internal key and a valid access token',
    async (path) => {
      const { app } = makeApp();
      app.get(path, () => ({ ok: true }));
      const response = await app.inject({
        method: 'GET',
        url: path,
        headers: { ...INTERNAL_KEY_HEADER, authorization: `Bearer ${VALID_DRIVER_TOKEN}` },
      });
      expect(response.statusCode).toBe(200);
    },
  );

  it('does not gate a route outside routing/hazards/feedback, e.g. a future module', async () => {
    const { app } = makeApp();
    app.get('/admin/protected', () => ({ ok: true }));
    const response = await app.inject({
      method: 'GET',
      url: '/admin/protected',
      headers: INTERNAL_KEY_HEADER,
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('request IDs', () => {
  it('generates one from the ID port and returns it in a header', async () => {
    const { app } = makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-request-id']).toBe(FIRST_ID);
  });

  it('honours an ID sent by the BFF so a request can be followed across services', async () => {
    const { app } = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'from-the-bff' },
    });
    expect(response.headers['x-request-id']).toBe('from-the-bff');
  });
});

describe('error handling', () => {
  it('does not leak an unexpected error message, but gives the request ID to quote', async () => {
    const { app } = makeApp();
    app.get('/boom', () => {
      throw new Error('connection to db.internal:5432 refused, password=hunter2');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/boom',
      headers: INTERNAL_KEY_HEADER,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('db.internal');
    expect(response.json()).toEqual({ error: 'internal_error', requestId: FIRST_ID });
  });

  it('returns a JSON 404 carrying the request ID, once past the internal-key gate', async () => {
    const { app } = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: INTERNAL_KEY_HEADER,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found', requestId: FIRST_ID });
  });

  it('passes client errors (4xx) through with their own status', async () => {
    const { app } = makeApp();
    app.post('/echo', () => 'never reached');
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json', ...INTERNAL_KEY_HEADER },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('FST_ERR_CTP_INVALID_JSON_BODY');
  });
});
