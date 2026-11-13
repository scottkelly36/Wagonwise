import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { buildApp } from './build-app.js';
import { FixedWindowLimiter, LIMITS } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('allows up to the limit per key per window, then says when to retry', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(2, 60_000, () => now);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(true);
    now = 15_000;
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 45 });
    expect(limiter.hit('b').allowed).toBe(true);
    now = 60_000;
    expect(limiter.hit('a').allowed).toBe(true);
  });
});

/** A host with two plain routes standing in for an open one and a paid one. */
function makeApp(env: Record<string, string> = {}) {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ...env }));
  app.post('/identity/otp/request', () => ({ ok: true }));
  app.post('/hazards/voice-reports/parse', () => ({ ok: true }));
  app.get('/app/version', () => ({}));
  return app;
}

const from = (ip: string) => ({ 'x-forwarded-for': ip });

describe('rate limit', () => {
  it('is off when no proxy is configured, because every caller would look the same', async () => {
    const app = makeApp();
    for (let i = 0; i < LIMITS.open.limit + 5; i++) {
      const res = await app.inject({ method: 'POST', url: '/identity/otp/request' });
      expect(res.statusCode).toBe(200);
    }
  });

  it('429s one address on the open routes after its allowance, and says when to retry', async () => {
    const app = makeApp({ TRUST_PROXY_HOPS: '1' });
    for (let i = 0; i < LIMITS.open.limit; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/identity/otp/request',
        headers: from('203.0.113.7'),
      });
      expect(res.statusCode).toBe(200);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      headers: from('203.0.113.7'),
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'too_many_requests' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['x-content-type-options']).toBe('nosniff');
    // A different address is not affected, and nor are ordinary routes for the blocked one.
    const other = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      headers: from('198.51.100.9'),
    });
    expect(other.statusCode).toBe(200);
    const ordinary = await app.inject({
      method: 'GET',
      url: '/app/version',
      headers: from('203.0.113.7'),
    });
    expect(ordinary.statusCode).toBe(200);
  });

  it('keeps a tighter allowance on the routes that call a paid service', async () => {
    const app = makeApp({ TRUST_PROXY_HOPS: '1' });
    for (let i = 0; i < LIMITS.paid.limit; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/hazards/voice-reports/parse',
        headers: from('203.0.113.7'),
      });
      expect(res.statusCode).toBe(200);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/hazards/voice-reports/parse',
      headers: from('203.0.113.7'),
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('cannot be dodged by adding an address in front of the real one', async () => {
    const app = makeApp({ TRUST_PROXY_HOPS: '1' });
    for (let i = 0; i < LIMITS.open.limit; i++) {
      await app.inject({
        method: 'POST',
        url: '/identity/otp/request',
        headers: from('203.0.113.7'),
      });
    }
    const spoofed = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      headers: from('1.2.3.4, 203.0.113.7'),
    });
    expect(spoofed.statusCode).toBe(429);
  });

  it('never limits the health check', async () => {
    const app = makeApp({ TRUST_PROXY_HOPS: '1' });
    for (let i = 0; i < LIMITS.overall.limit + 20; i++) {
      const res = await app.inject({ method: 'GET', url: '/health', headers: from('10.0.0.1') });
      expect(res.statusCode).toBe(200);
    }
  });
});
