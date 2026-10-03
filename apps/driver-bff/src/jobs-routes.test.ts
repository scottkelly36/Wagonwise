import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerJobsRoutes } from './jobs-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_HEADER = { authorization: `Bearer ${VALID_TOKEN}` };

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerJobsRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

describe('jobs routes', () => {
  it('require a Bearer token, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [method, url, payload] of [
      ['GET', '/jobs/current', undefined],
      ['POST', `/jobs/${JOB_ID}/status`, { status: 'accepted' }],
      ['POST', `/jobs/${JOB_ID}/fail`, undefined],
      ['POST', `/jobs/${JOB_ID}/position`, { location: { lat: 54.9, lon: -2.1 } }],
      [
        'POST',
        `/jobs/${JOB_ID}/proof-of-delivery`,
        { contentType: 'image/jpeg', dataBase64: 'YQ==' },
      ],
    ] as const) {
      const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(response.statusCode).toBe(401);
    }
    expect(coreClient.calls).toEqual([]);
  });

  it('forwards each call to core with the driver’s own token, relaying core unchanged', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 200, body: { job: null } };
    const current = await app.inject({ method: 'GET', url: '/jobs/current', headers: AUTH_HEADER });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({ job: null });
    expect(coreClient.calls[0]).toMatchObject({
      method: 'GET',
      path: '/jobs/current',
      authorization: `Bearer ${VALID_TOKEN}`,
    });

    coreClient.nextResponse = { status: 200, body: { id: JOB_ID, status: 'accepted' } };
    const advanced = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'accepted' },
      headers: AUTH_HEADER,
    });
    expect(advanced.statusCode).toBe(200);
    expect(coreClient.calls[1]).toMatchObject({
      method: 'POST',
      path: `/jobs/${JOB_ID}/status`,
      body: { status: 'accepted' },
      authorization: `Bearer ${VALID_TOKEN}`,
    });

    coreClient.nextResponse = { status: 404, body: { tag: 'JobNotFound' } };
    const failed = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/fail`,
      headers: AUTH_HEADER,
    });
    expect(failed.statusCode).toBe(404);
  });

  it('forwards a proof-of-delivery photo, relaying core’s 204', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };
    const payload = {
      contentType: 'image/jpeg',
      dataBase64: Buffer.from('a photo').toString('base64'),
    };
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload,
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: `/jobs/${JOB_ID}/proof-of-delivery`,
      body: payload,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
  });

  it('forwards a position report, relaying core’s 204 and its NotTracking refusal', async () => {
    const { app, coreClient } = buildApp();
    const payload = { location: { lat: 54.9, lon: -2.1 } };
    coreClient.nextResponse = { status: 204, body: undefined };
    const ok = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/position`,
      payload,
      headers: AUTH_HEADER,
    });
    expect(ok.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({
      path: `/jobs/${JOB_ID}/position`,
      body: payload,
      authorization: `Bearer ${VALID_TOKEN}`,
    });
    coreClient.nextResponse = { status: 409, body: { tag: 'NotTracking' } };
    const refused = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/position`,
      payload,
      headers: AUTH_HEADER,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ tag: 'NotTracking' });
  });

  it('400s an off-planet position without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/position`,
      payload: { location: { lat: 95, lon: 0 } },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('400s a bad proof-of-delivery body without calling core', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/proof-of-delivery`,
      payload: { contentType: 'image/jpeg', dataBase64: 'not base64!!' },
      headers: AUTH_HEADER,
    });
    expect(response.statusCode).toBe(400);
    expect(coreClient.calls).toEqual([]);
  });

  it('validates the body and the id before calling core', async () => {
    const { app, coreClient } = buildApp();
    const badId = await app.inject({
      method: 'POST',
      url: '/jobs/not-a-uuid/status',
      payload: { status: 'accepted' },
      headers: AUTH_HEADER,
    });
    const badBody = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/status`,
      payload: { status: 'flying' },
      headers: AUTH_HEADER,
    });
    expect([badId.statusCode, badBody.statusCode]).toEqual([400, 400]);
    expect(coreClient.calls).toEqual([]);
  });
});
