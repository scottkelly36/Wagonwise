import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { StaffAccessTokenVerifier } from './access-token-verifier.js';
import { registerStaffAuth, STAFF_PUBLIC_PATHS } from './staff-auth.js';

const verifier: StaffAccessTokenVerifier = {
  verify: (token) =>
    token === 'good-staff-token'
      ? Promise.resolve({ staffId: 'staff-1', sessionId: 'sess-1' })
      : Promise.reject(new Error('bad')),
};

function makeApp() {
  const app = Fastify();
  registerStaffAuth(app, verifier);
  const echo = (request: { staffId?: string; staffSessionId?: string }) => ({
    staffId: request.staffId ?? null,
    sessionId: request.staffSessionId ?? null,
  });
  app.get('/staff/me', (request) => echo(request));
  for (const path of STAFF_PUBLIC_PATHS) app.post(path, (request) => echo(request));
  app.get('/routing/anything', (request) => echo(request));
  return app;
}

describe('registerStaffAuth', () => {
  it('needs a bearer token on staff routes', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/staff/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'missing_bearer_token' });
  });

  it('rejects a token the staff verifier refuses (e.g. a driver token)', async () => {
    const res = await makeApp().inject({
      method: 'GET',
      url: '/staff/me',
      headers: { authorization: 'Bearer driver-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_access_token' });
  });

  it('puts the staff id from a valid token on the request', async () => {
    const res = await makeApp().inject({
      method: 'GET',
      url: '/staff/me?x=1',
      headers: { authorization: 'Bearer good-staff-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ staffId: 'staff-1', sessionId: 'sess-1' });
  });

  it('leaves the pre-sign-in routes open', async () => {
    for (const path of STAFF_PUBLIC_PATHS) {
      const res = await makeApp().inject({ method: 'POST', url: path });
      expect(res.statusCode).toBe(200);
    }
  });

  it('does not touch non-staff routes', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/routing/anything' });
    expect(res.statusCode).toBe(200);
  });
});
