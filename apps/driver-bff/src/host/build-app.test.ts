import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { buildApp } from './build-app.js';

function makeApp() {
  return buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
}

describe('GET /health', () => {
  it('reports ok', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'driver-bff' });
  });
});

describe('request IDs', () => {
  it('generates one and returns it in a header', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours an inbound request id, so a request can be followed across services', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'from-the-driver-app' },
    });
    expect(response.headers['x-request-id']).toBe('from-the-driver-app');
  });
});

describe('CORS', () => {
  it('allows the configured dashboard origin', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', DASHBOARD_ORIGIN: 'http://dash.test' }));
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://dash.test' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://dash.test');
  });

  // `@fastify/cors` with a fixed string `origin` always sets the header to that configured
  // value, whatever the request's own Origin is — it's the *browser* that then refuses to let
  // evil.test's own script read the response, by comparing its own origin against this header
  // rather than the server changing its answer per request. So the real assertion is "the
  // configured origin is what gets sent," not "an unrelated Origin gets nothing back".
  it('never allows an origin other than the configured one', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', DASHBOARD_ORIGIN: 'http://dash.test' }));
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.test' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://dash.test');
  });
});

describe('error handling', () => {
  it('does not leak an unexpected error message', async () => {
    const app = makeApp();
    app.get('/boom', () => {
      throw new Error('secret-internal-detail');
    });
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret-internal-detail');
    expect(response.json()).toMatchObject({ error: 'internal_error' });
  });

  it('returns a JSON 404', async () => {
    const app = makeApp();
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});
