import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { registerStaffRoutes } from '../staff-routes.js';
import { FakeCoreClient, FakeStaffTokenVerifier } from '../testing/fakes.js';
import { buildApp } from './build-app.js';
import { FixedWindowLimiter, GUESSES_PER_WINDOW } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('allows up to the limit per key per window, then says when to retry', () => {
    let now = 0;
    const limiter = new FixedWindowLimiter(2, 60_000, () => now);
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(true);
    now = 15_000;
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 45 });
    expect(limiter.hit('b').allowed).toBe(true); // another key has its own count
    now = 60_000;
    expect(limiter.hit('a').allowed).toBe(true); // a fresh window
  });
});

/** The host and routes wired the way main.ts does: host first, routes after. */
function makeApp(env: Record<string, string> = {}) {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ...env }));
  const core = new FakeCoreClient();
  core.nextResponse = { status: 401, body: { tag: 'InvalidCredentials', requestId: 'r' } };
  registerStaffRoutes(app, { coreClient: core, staffTokenVerifier: new FakeStaffTokenVerifier() });
  return { app, core };
}

const signIn = { email: 'a@example.com', password: 'correct horse battery' };

describe('sign-in rate limit (P2-M1.12)', () => {
  it(`429s one address after ${GUESSES_PER_WINDOW} tries, before core is called`, async () => {
    const { app, core } = makeApp();
    for (let i = 0; i < GUESSES_PER_WINDOW; i++) {
      const res = await app.inject({ method: 'POST', url: '/staff/auth/sign-in', payload: signIn });
      expect(res.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/staff/auth/second-factor',
      payload: { challengeId: '22222222-2222-4222-8222-222222222222', code: '123456' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'too_many_requests' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(core.calls).toHaveLength(GUESSES_PER_WINDOW);
  });

  it('counts the real caller behind one trusted proxy, not the proxy', async () => {
    const { app } = makeApp({ TRUST_PROXY_HOPS: '1' });
    const from = (ip: string) => ({ 'x-forwarded-for': ip });
    for (let i = 0; i < GUESSES_PER_WINDOW + 1; i++) {
      await app.inject({
        method: 'POST',
        url: '/staff/auth/sign-in',
        payload: signIn,
        headers: from('203.0.113.7'),
      });
    }
    const other = await app.inject({
      method: 'POST',
      url: '/staff/auth/sign-in',
      payload: signIn,
      headers: from('198.51.100.9'),
    });
    expect(other.statusCode).toBe(401); // a different caller is not blocked
    // A caller can't dodge the limit by adding their own address in front.
    const spoofed = await app.inject({
      method: 'POST',
      url: '/staff/auth/sign-in',
      payload: signIn,
      headers: from('1.2.3.4, 203.0.113.7'),
    });
    expect(spoofed.statusCode).toBe(429);
  });

  it('leaves other routes alone', async () => {
    const { app } = makeApp();
    for (let i = 0; i < GUESSES_PER_WINDOW + 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    }
  });
});
