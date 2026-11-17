import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';
import { registerUsageRoutes } from './usage-routes.js';

const VALID_TOKEN = 'a-real-token';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerUsageRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const batch = (events: unknown[]) => ({
  sessionId: 'b6f1a6b2-3c1d-4e8a-9f0b-2a4c6e8d0f12',
  appVersion: '1.2.1',
  platform: 'ios',
  events,
});
const AT = '2026-11-17T10:00:00.000Z';

describe('POST /usage/flow-events', () => {
  it('forwards a valid batch with the token and relays core’s answer', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { recorded: 1 } };
    const body = batch([{ event: 'start_chosen', choice: 'my_position', at: AT }]);

    const response = await app.inject({
      method: 'POST',
      url: '/usage/flow-events',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded: 1 });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/usage/flow-events',
      body,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('refuses anything off the fixed lists, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/usage/flow-events',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: batch([{ event: 'destination_chosen', choice: 'filled.count.soap', at: AT }]),
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('requires a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/usage/flow-events',
      payload: batch([{ event: 'route_shown', at: AT }]),
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });
});
