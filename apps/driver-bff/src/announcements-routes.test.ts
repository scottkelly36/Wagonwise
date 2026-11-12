import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAnnouncementsRoutes } from './announcements-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerAnnouncementsRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('GET /announcements/latest', () => {
  it('forwards the token to core and relays the answer unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { announcement: null } };

    const response = await app.inject({
      method: 'GET',
      url: '/announcements/latest',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ announcement: null });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/announcements/latest',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/announcements/latest' });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });
});

describe('the notification preference', () => {
  it('forwards a read with the token and relays the answer', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { pushes: true } };
    const response = await app.inject({
      method: 'GET',
      url: '/announcements/preference',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(response.json()).toEqual({ pushes: true });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/announcements/preference',
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('forwards a change, and refuses a body that is not on or off without calling core', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { pushes: false } };
    const ok = await app.inject({
      method: 'PUT',
      url: '/announcements/preference',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { pushes: false },
    });
    expect(ok.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({ method: 'PUT', body: { pushes: false } });

    const bad = await app.inject({
      method: 'PUT',
      url: '/announcements/preference',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { pushes: 'maybe' },
    });
    expect(bad.statusCode).toBe(400);
    expect(coreClient.calls).toHaveLength(1);
  });

  it('requires a Bearer token for both', async () => {
    const { app, coreClient } = buildApp();
    expect((await app.inject({ method: 'GET', url: '/announcements/preference' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/announcements/preference',
          payload: { pushes: true },
        })
      ).statusCode,
    ).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });
});
