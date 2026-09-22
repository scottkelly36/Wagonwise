import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AccessTokenClaims, AccessTokenVerifier } from './auth/access-token-verifier.js';
import type { CoreClient, CoreResponse } from './core-client.js';
import { registerIdentityRoutes } from './identity-routes.js';

class FakeCoreClient implements CoreClient {
  readonly calls: { path: string; body: unknown; requestId: string }[] = [];
  nextResponse: CoreResponse = { status: 200, body: { ok: true } };

  post(path: string, body: unknown, requestId: string): Promise<CoreResponse> {
    this.calls.push({ path, body, requestId });
    return Promise.resolve(this.nextResponse);
  }
}

class FakeAccessTokenVerifier implements AccessTokenVerifier {
  claimsByToken = new Map<string, AccessTokenClaims>();

  verify(token: string): Promise<AccessTokenClaims> {
    const claims = this.claimsByToken.get(token);
    if (!claims) {
      return Promise.reject(new Error('invalid token'));
    }
    return Promise.resolve(claims);
  }
}

function buildApp(): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
  verifier: FakeAccessTokenVerifier;
} {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  const app = Fastify();
  registerIdentityRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient, verifier };
}

describe('POST /identity/otp/request', () => {
  it('forwards a valid body to core and relays its response', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: {} };

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'a@example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(coreClient.calls).toHaveLength(1);
    expect(coreClient.calls[0]).toMatchObject({
      path: '/identity/otp/request',
      body: { identifier: 'a@example.com' },
    });
    expect(coreClient.calls[0]?.requestId).toBeTruthy();
  });

  it('400s locally on a malformed body, without calling core at all', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { nonsense: true },
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('relays a non-200 status from core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 429, body: { tag: 'TooManyAttempts' } };

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'a@example.com', inviteCode: 'X' },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ tag: 'TooManyAttempts' });
  });
});

describe('POST /identity/otp/verify', () => {
  it('forwards to core', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = {
      status: 200,
      body: { accessToken: 'a', refreshToken: 'b', driver: { id: 'x' } },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'a@example.com', code: '000001' },
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]?.path).toBe('/identity/otp/verify');
  });
});

describe('POST /identity/token/refresh', () => {
  it('forwards to core', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { accessToken: 'a', refreshToken: 'b' } };

    const response = await app.inject({
      method: 'POST',
      url: '/identity/token/refresh',
      payload: { refreshToken: 'raw' },
    });
    expect(response.statusCode).toBe(200);
    expect(coreClient.calls[0]?.path).toBe('/identity/token/refresh');
  });
});

describe('POST /identity/sessions/:id/revoke', () => {
  const SESSION_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_SESSION_ID = '22222222-2222-4222-8222-222222222222';

  let scenario: ReturnType<typeof buildApp>;
  beforeEach(() => {
    scenario = buildApp();
  });

  it('requires a Bearer token', async () => {
    const response = await scenario.app.inject({
      method: 'POST',
      url: `/identity/sessions/${SESSION_ID}/revoke`,
    });
    expect(response.statusCode).toBe(401);
    expect(scenario.coreClient.calls).toEqual([]);
  });

  it('rejects a token that fails verification', async () => {
    const response = await scenario.app.inject({
      method: 'POST',
      url: `/identity/sessions/${SESSION_ID}/revoke`,
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(response.statusCode).toBe(401);
    expect(scenario.coreClient.calls).toEqual([]);
  });

  it("rejects revoking a session that isn't the token's own (403), without calling core", async () => {
    scenario.verifier.claimsByToken.set('good-token', {
      driverId: 'driver-1',
      sessionId: OTHER_SESSION_ID,
    });
    const response = await scenario.app.inject({
      method: 'POST',
      url: `/identity/sessions/${SESSION_ID}/revoke`,
      headers: { authorization: 'Bearer good-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(scenario.coreClient.calls).toEqual([]);
  });

  it("forwards to core once the token's own session id matches the URL", async () => {
    scenario.verifier.claimsByToken.set('good-token', {
      driverId: 'driver-1',
      sessionId: SESSION_ID,
    });
    scenario.coreClient.nextResponse = { status: 204, body: undefined };

    const response = await scenario.app.inject({
      method: 'POST',
      url: `/identity/sessions/${SESSION_ID}/revoke`,
      headers: { authorization: 'Bearer good-token' },
    });
    expect(response.statusCode).toBe(204);
    expect(scenario.coreClient.calls).toHaveLength(1);
    expect(scenario.coreClient.calls[0]).toMatchObject({
      path: `/identity/sessions/${SESSION_ID}/revoke`,
      body: undefined,
    });
    expect(scenario.coreClient.calls[0]?.requestId).toBeTruthy();
  });

  it('400s a non-UUID session id before even checking for a token', async () => {
    const response = await scenario.app.inject({
      method: 'POST',
      url: '/identity/sessions/not-a-uuid/revoke',
    });
    expect(response.statusCode).toBe(400);
  });
});
