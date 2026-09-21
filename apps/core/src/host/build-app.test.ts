import { describe, expect, it } from 'vitest';
import { loadConfig, PRODUCT_NAME } from '../config.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';
import { buildApp } from './build-app.js';

const FIRST_ID = '00000000-0000-4000-8000-000000000001';

function makeApp() {
  const clock = new FakeClock('2026-03-01T12:00:00.000Z');
  const ids = new SequentialIdGenerator();
  const app = buildApp({ config: loadConfig({ LOG_LEVEL: 'silent' }), clock, ids });
  return { app, clock, ids };
}

describe('GET /health', () => {
  it('reports ok, and takes the time from the injected clock', async () => {
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

    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(response.body).not.toContain('db.internal');
    expect(response.json()).toEqual({ error: 'internal_error', requestId: FIRST_ID });
  });

  it('returns a JSON 404 carrying the request ID', async () => {
    const { app } = makeApp();
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found', requestId: FIRST_ID });
  });

  it('passes client errors (4xx) through with their own status', async () => {
    const { app } = makeApp();
    app.post('/echo', () => 'never reached');
    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('FST_ERR_CTP_INVALID_JSON_BODY');
  });
});
