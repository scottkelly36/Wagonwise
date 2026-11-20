import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerReferralsRoutes } from './referrals-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const ID = '11111111-1111-4111-8111-111111111111';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerReferralsRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('referrals', () => {
  it('forwards the driver’s own list with the token and relays it', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { code: 'WW-ABCDEF', rewardPounds: 25, referrals: [] },
    };
    const response = await app.inject({
      method: 'GET',
      url: '/referrals/me',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(response.json()).toEqual({ code: 'WW-ABCDEF', rewardPounds: 25, referrals: [] });
    expect(coreClient.calls[0]).toMatchObject({ method: 'GET', path: '/referrals/me' });
  });

  it('forwards a claim with a real email, and refuses one without, or without a token', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { id: ID, status: 'claimed' } };
    const ok = await app.inject({
      method: 'POST',
      url: `/referrals/${ID}/claim`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { email: 'dave@example.com' },
    });
    expect(ok.statusCode).toBe(200);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/referrals/${ID}/claim`,
      body: { email: 'dave@example.com' },
    });
    const bad = await app.inject({
      method: 'POST',
      url: `/referrals/${ID}/claim`,
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { email: 'not an email' },
    });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/referrals/me' })).statusCode).toBe(401);
    expect(coreClient.calls).toHaveLength(1);
  });
});
