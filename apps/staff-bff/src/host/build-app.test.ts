import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { buildApp } from './build-app.js';

function makeApp(env: Record<string, string> = {}) {
  return buildApp(loadConfig({ LOG_LEVEL: 'silent', ...env }));
}

describe('staff-bff host', () => {
  it('reports health as staff-bff', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'staff-bff' });
  });

  it('generates a request id, or keeps an inbound one', async () => {
    const app = makeApp();
    const fresh = await app.inject({ method: 'GET', url: '/health' });
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'from-the-dashboard' },
    });
    expect(kept.headers['x-request-id']).toBe('from-the-dashboard');
  });

  it('allows only the configured dashboard origin', async () => {
    const app = makeApp({ DASHBOARD_ORIGIN: 'http://dash.test' });
    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://dash.test' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://dash.test');
    const other = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.test' },
    });
    expect(other.headers['access-control-allow-origin']).not.toBe('http://evil.test');
  });

  it('answers unknown routes with 404 and a request id', async () => {
    const response = await makeApp().inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});
