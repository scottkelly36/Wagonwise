import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerStaffRoutes } from './staff-routes.js';
import { FakeCoreClient, FakeStaffTokenVerifier } from './testing/fakes.js';

const STAFF_TOKEN = 'a-staff-token';
const AUTH = { authorization: `Bearer ${STAFF_TOKEN}` };
const STAFF_ID = '99999999-9999-4999-8999-999999999999';
const ACME = '11111111-1111-4111-8111-111111111111';

function buildApp(): { app: FastifyInstance; core: FakeCoreClient } {
  const core = new FakeCoreClient();
  const verifier = new FakeStaffTokenVerifier();
  verifier.claimsByToken.set(STAFF_TOKEN, { staffId: STAFF_ID, sessionId: 'session-1' });
  const app = Fastify();
  registerStaffRoutes(app, { coreClient: core, staffTokenVerifier: verifier });
  return { app, core };
}

describe('staff routes before sign-in', () => {
  it.each([
    ['/staff/auth/sign-in', { email: 'a@example.com', password: 'correct horse battery' }],
    [
      '/staff/auth/second-factor',
      { challengeId: '22222222-2222-4222-8222-222222222222', code: '123456' },
    ],
    ['/staff/auth/refresh', { refreshToken: 'r' }],
    ['/staff/auth/sign-out', { refreshToken: 'r' }],
    [
      '/staff/invites/accept',
      { inviteToken: 't', password: 'correct horse battery', secondFactorMethod: 'totp' },
    ],
    [
      '/staff/invites/confirm',
      { enrolmentId: '33333333-3333-4333-8333-333333333333', code: '123456' },
    ],
  ])('%s forwards a valid body with no token, relaying core unchanged', async (url, payload) => {
    const { app, core } = buildApp();
    core.nextResponse = { status: 401, body: { tag: 'InvalidCredentials', requestId: 'x' } };

    const res = await app.inject({ method: 'POST', url, payload });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ tag: 'InvalidCredentials', requestId: 'x' });
    expect(core.calls).toHaveLength(1);
    expect(core.calls[0]).toMatchObject({ method: 'POST', path: url, body: payload });
    expect(core.calls[0]?.authorization).toBeUndefined();
  });

  it('400s a malformed body without calling core', async () => {
    const { app, core } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/auth/sign-in',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(core.calls).toEqual([]);
  });

  it('refuses a too-short password when accepting an invite, before core sees it', async () => {
    const { app, core } = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/staff/invites/accept',
      payload: { inviteToken: 't', password: 'short', secondFactorMethod: 'totp' },
    });
    expect(res.statusCode).toBe(400);
    expect(core.calls).toEqual([]);
  });
});

describe('staff routes after sign-in', () => {
  it.each([
    ['GET', '/staff/me'],
    ['POST', '/staff/invites'],
    ['GET', '/staff/members'],
    ['GET', '/staff/audit'],
    ['PUT', `/staff/members/${STAFF_ID}/privileges`],
    ['DELETE', `/staff/members/${STAFF_ID}`],
  ] as const)('%s %s 401s without a staff token, never calling core', async (method, url) => {
    const { app, core } = buildApp();
    const missing = await app.inject({ method, url });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toMatchObject({ error: 'missing_bearer_token' });

    const bad = await app.inject({ method, url, headers: { authorization: 'Bearer forged' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: 'invalid_access_token' });
    expect(core.calls).toEqual([]);
  });

  it('forwards /staff/me with the original token', async () => {
    const { app, core } = buildApp();
    core.nextResponse = { status: 200, body: { id: STAFF_ID, kind: 'platform' } };
    const res = await app.inject({ method: 'GET', url: '/staff/me', headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: STAFF_ID, kind: 'platform' });
    expect(core.calls[0]).toMatchObject({
      method: 'GET',
      path: '/staff/me',
      authorization: `Bearer ${STAFF_TOKEN}`,
    });
  });

  it('forwards an invite, and 400s one that breaks the contract', async () => {
    const { app, core } = buildApp();
    const invite = {
      kind: 'fleet',
      email: 'boss@acme.example',
      name: 'Boss',
      companyId: ACME,
      privileges: ['manage_users'],
    };
    core.nextResponse = { status: 201, body: { invite: {}, inviteToken: 't' } };
    const ok = await app.inject({
      method: 'POST',
      url: '/staff/invites',
      headers: AUTH,
      payload: invite,
    });
    expect(ok.statusCode).toBe(201);
    expect(core.calls[0]).toMatchObject({ path: '/staff/invites', body: invite });

    const noCompany = await app.inject({
      method: 'POST',
      url: '/staff/invites',
      headers: AUTH,
      payload: { ...invite, companyId: undefined },
    });
    expect(noCompany.statusCode).toBe(400);
    expect(core.calls).toHaveLength(1);
  });

  it('passes the company filter through on the members list', async () => {
    const { app, core } = buildApp();
    await app.inject({ method: 'GET', url: `/staff/members?companyId=${ACME}`, headers: AUTH });
    await app.inject({ method: 'GET', url: '/staff/members', headers: AUTH });
    expect(core.calls.map((c) => c.path)).toEqual([
      `/staff/members?companyId=${ACME}`,
      '/staff/members',
    ]);

    const bad = await app.inject({
      method: 'GET',
      url: '/staff/members?companyId=not-a-uuid',
      headers: AUTH,
    });
    expect(bad.statusCode).toBe(400);
    expect(core.calls).toHaveLength(2);
  });

  it("forwards privilege changes and removals, relaying core's refusals as they are", async () => {
    const { app, core } = buildApp();
    core.nextResponse = { status: 409, body: { tag: 'LastManager', requestId: 'x' } };
    const put = await app.inject({
      method: 'PUT',
      url: `/staff/members/${STAFF_ID}/privileges`,
      headers: AUTH,
      payload: { privileges: ['view_reports'] },
    });
    expect(put.statusCode).toBe(409);
    expect(put.json()).toMatchObject({ tag: 'LastManager' });

    core.nextResponse = { status: 204, body: undefined };
    const del = await app.inject({
      method: 'DELETE',
      url: `/staff/members/${STAFF_ID}`,
      headers: AUTH,
    });
    expect(del.statusCode).toBe(204);
    expect(core.calls.map((c) => [c.method, c.path])).toEqual([
      ['PUT', `/staff/members/${STAFF_ID}/privileges`],
      ['DELETE', `/staff/members/${STAFF_ID}`],
    ]);
  });

  it('forwards the audit log, with or without a company filter', async () => {
    const { app, core } = buildApp();
    core.nextResponse = { status: 200, body: { entries: [] } };
    await app.inject({ method: 'GET', url: '/staff/audit', headers: AUTH });
    await app.inject({ method: 'GET', url: `/staff/audit?companyId=${ACME}`, headers: AUTH });
    expect(core.calls.map((c) => [c.path, c.authorization])).toEqual([
      ['/staff/audit', `Bearer ${STAFF_TOKEN}`],
      [`/staff/audit?companyId=${ACME}`, `Bearer ${STAFF_TOKEN}`],
    ]);
  });

  it('400s a member id that is not a uuid', async () => {
    const { app, core } = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/staff/members/1', headers: AUTH });
    expect(res.statusCode).toBe(400);
    expect(core.calls).toEqual([]);
  });
});
