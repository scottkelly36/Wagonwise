import type {
  AcceptStaffInviteResponse,
  ConfirmStaffEnrolmentResponse,
  CreateStaffInviteResponse,
  StaffRefreshTokenResponse,
  StaffSignInResponse,
  StaffTokensResponse,
} from '@wagonwise/contracts/staff';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffDeps } from '../application/staff-deps.js';
import {
  FakePasswordHasher,
  FakeSecretBox,
  FakeStaffTokenIssuer,
  FakeTotp,
  RecordingCodeSender,
  SequentialRandomCodes,
} from '../application/testing/fake-staff-crypto.js';
import {
  InMemoryStaffAccountRepository,
  InMemoryStaffChallengeRepository,
  InMemoryStaffInviteRepository,
  InMemoryStaffRecoveryCodeRepository,
  InMemoryStaffSessionRepository,
} from '../application/testing/in-memory-staff-repositories.js';
import type { PlatformStaff } from '../domain/staff-account.js';
import { registerStaffRoutes } from './staff-routes.js';

const PASSWORD = 'correct horse battery';
const ACME = '11111111-1111-4111-8111-111111111111';

// `request.staffId` normally comes from host/staff-auth.ts's hook, which staff-auth.test.ts
// already tests against real verification. This suite stands in for it (modules can't import
// host/): FakeStaffTokenIssuer issues `access:<staffId>:<sessionId>`, and the hook reads it back.
function fakeStaffAuth(app: FastifyInstance): void {
  app.decorateRequest('staffId', undefined);
  app.addHook('onRequest', (request, _reply, done) => {
    const [prefix, staffId] = (request.headers.authorization ?? '')
      .replace(/^Bearer /, '')
      .split(':');
    if (prefix === 'access' && staffId) request.staffId = staffId;
    done();
  });
}

let app: FastifyInstance;
let scopes: RecordingDataScopes;
let deps: StaffDeps & { totp: FakeTotp; codeSender: RecordingCodeSender };

beforeEach(async () => {
  deps = {
    accounts: new InMemoryStaffAccountRepository(),
    invites: new InMemoryStaffInviteRepository(),
    sessions: new InMemoryStaffSessionRepository(),
    challenges: new InMemoryStaffChallengeRepository(),
    recoveryCodes: new InMemoryStaffRecoveryCodeRepository(),
    passwordHasher: new FakePasswordHasher(),
    secretBox: new FakeSecretBox(),
    totp: new FakeTotp(),
    codeSender: new RecordingCodeSender(),
    randomCodes: new SequentialRandomCodes(),
    tokenIssuer: new FakeStaffTokenIssuer(),
    clock: new FakeClock('2026-09-28T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  const admin: PlatformStaff = {
    kind: 'platform',
    id: makeId<'StaffId'>('99999999-9999-4999-8999-999999999999'),
    email: 'support@wagon-wise.co.uk',
    name: 'Support',
    secondFactorMethod: 'totp',
    createdAt: deps.clock.now(),
  };
  await deps.accounts.create(admin, {
    staffId: admin.id,
    passwordHash: `hashed:${PASSWORD}`,
    secondFactor: { method: 'totp', secretCiphertext: 'sealed:S' },
  });

  app = Fastify();
  fakeStaffAuth(app);
  scopes = new RecordingDataScopes();
  registerStaffRoutes(app, deps, scopes);
});

async function signIn(email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const challenge = await app.inject({
    method: 'POST',
    url: '/staff/auth/sign-in',
    payload: { email, password: PASSWORD },
  });
  expect(challenge.statusCode).toBe(200);
  const tokens = await app.inject({
    method: 'POST',
    url: '/staff/auth/second-factor',
    payload: {
      challengeId: challenge.json<StaffSignInResponse>().challengeId,
      code: deps.totp.currentCode,
    },
  });
  expect(tokens.statusCode).toBe(200);
  return tokens.json<StaffTokensResponse>();
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('staff routes', () => {
  it('signs in with password then second factor, and /staff/me returns the account', async () => {
    const { accessToken } = await signIn('support@wagon-wise.co.uk');
    const me = await app.inject({ method: 'GET', url: '/staff/me', headers: bearer(accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ kind: 'platform', email: 'support@wagon-wise.co.uk' });
    expect(me.json()).not.toHaveProperty('passwordHash');
  });

  it('401s a wrong password the same as an unknown email', async () => {
    for (const email of ['support@wagon-wise.co.uk', 'nobody@example.com']) {
      const res = await app.inject({
        method: 'POST',
        url: '/staff/auth/sign-in',
        payload: { email, password: 'wrong wrong wrong' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ tag: 'InvalidCredentials' });
    }
  });

  it('400s a malformed body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/staff/auth/sign-in',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('needs a staff token for everything past sign-in', async () => {
    for (const [method, url] of [
      ['GET', '/staff/me'],
      ['GET', '/staff/members'],
      ['POST', '/staff/invites'],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
    }
  });

  it('runs the whole invite → join → sign in → manage flow over HTTP', async () => {
    const { accessToken: adminToken } = await signIn('support@wagon-wise.co.uk');

    const invite = await app.inject({
      method: 'POST',
      url: '/staff/invites',
      headers: bearer(adminToken),
      payload: {
        kind: 'fleet',
        email: 'boss@acme.example',
        name: 'Boss',
        companyId: ACME,
        privileges: ['manage_users', 'dispatch', 'view_reports'],
      },
    });
    expect(invite.statusCode).toBe(201);
    const { inviteToken } = invite.json<CreateStaffInviteResponse>();
    expect(invite.json<CreateStaffInviteResponse>().invite).toMatchObject({
      email: 'boss@acme.example',
      companyId: ACME,
    });

    const accepted = await app.inject({
      method: 'POST',
      url: '/staff/invites/accept',
      payload: { inviteToken, password: PASSWORD, secondFactorMethod: 'totp' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<AcceptStaffInviteResponse>().totpUri).toContain('otpauth://totp/');

    const confirmed = await app.inject({
      method: 'POST',
      url: '/staff/invites/confirm',
      payload: {
        enrolmentId: accepted.json<AcceptStaffInviteResponse>().enrolmentId,
        code: deps.totp.currentCode,
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<ConfirmStaffEnrolmentResponse>().recoveryCodes).toHaveLength(10);
    const { staff: boss, accessToken: bossToken } = confirmed.json<ConfirmStaffEnrolmentResponse>();

    const list = await app.inject({
      method: 'GET',
      url: `/staff/members?companyId=${ACME}`,
      headers: bearer(bossToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ staff: unknown[] }>().staff).toHaveLength(1);

    const everyone = await app.inject({
      method: 'GET',
      url: '/staff/members',
      headers: bearer(bossToken),
    });
    expect(everyone.statusCode).toBe(403);

    const demoteSelf = await app.inject({
      method: 'PUT',
      url: `/staff/members/${boss.id}/privileges`,
      headers: bearer(bossToken),
      payload: { privileges: ['view_reports'] },
    });
    expect(demoteSelf.statusCode).toBe(409);
    expect(demoteSelf.json()).toMatchObject({ tag: 'LastManager' });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/staff/members/${boss.id}`,
      headers: bearer(adminToken),
    });
    expect(removed.statusCode).toBe(409); // still the company's only manager
  });

  it('a removed account is refused on its next request, even with an unexpired token', async () => {
    const { accessToken: adminToken } = await signIn('support@wagon-wise.co.uk');
    const invite = await app.inject({
      method: 'POST',
      url: '/staff/invites',
      headers: bearer(adminToken),
      payload: { kind: 'platform', email: 'temp@wagon-wise.co.uk', name: 'Temp', privileges: [] },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/staff/invites/accept',
      payload: {
        inviteToken: invite.json<CreateStaffInviteResponse>().inviteToken,
        password: PASSWORD,
        secondFactorMethod: 'totp',
      },
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: '/staff/invites/confirm',
      payload: {
        enrolmentId: accepted.json<AcceptStaffInviteResponse>().enrolmentId,
        code: deps.totp.currentCode,
      },
    });
    const temp = confirmed.json<ConfirmStaffEnrolmentResponse>();

    const removed = await app.inject({
      method: 'DELETE',
      url: `/staff/members/${temp.staff.id}`,
      headers: bearer(adminToken),
    });
    expect(removed.statusCode).toBe(204);

    const me = await app.inject({
      method: 'GET',
      url: '/staff/me',
      headers: bearer(temp.accessToken),
    });
    expect(me.statusCode).toBe(401);
  });

  it("runs sign-in in the staff-auth scope, then each request in the signed-in account's scope", async () => {
    const { accessToken } = await signIn('support@wagon-wise.co.uk');
    expect(scopes.used).toEqual([{ kind: 'staff-auth' }, { kind: 'staff-auth' }]);

    scopes.used.length = 0;
    await app.inject({ method: 'GET', url: '/staff/me', headers: bearer(accessToken) });
    // Loading the account (company unknown yet), then the work, as a WagonWise admin.
    expect(scopes.used).toEqual([{ kind: 'staff-auth' }, { kind: 'platform' }]);
  });

  it("runs a fleet user in their own company's scope", async () => {
    const { accessToken: adminToken } = await signIn('support@wagon-wise.co.uk');
    const invite = await app.inject({
      method: 'POST',
      url: '/staff/invites',
      headers: bearer(adminToken),
      payload: {
        kind: 'fleet',
        email: 'boss@acme.example',
        name: 'Boss',
        companyId: ACME,
        privileges: ['manage_users'],
      },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/staff/invites/accept',
      payload: {
        inviteToken: invite.json<CreateStaffInviteResponse>().inviteToken,
        password: PASSWORD,
        secondFactorMethod: 'totp',
      },
    });
    const confirmed = await app.inject({
      method: 'POST',
      url: '/staff/invites/confirm',
      payload: {
        enrolmentId: accepted.json<AcceptStaffInviteResponse>().enrolmentId,
        code: deps.totp.currentCode,
      },
    });

    scopes.used.length = 0;
    await app.inject({
      method: 'GET',
      url: `/staff/members?companyId=${ACME}`,
      headers: bearer(confirmed.json<ConfirmStaffEnrolmentResponse>().accessToken),
    });
    expect(scopes.used).toEqual([{ kind: 'staff-auth' }, { kind: 'company', companyId: ACME }]);
  });

  it('refresh rotates, and sign-out ends the session', async () => {
    const { refreshToken } = await signIn('support@wagon-wise.co.uk');
    const refreshed = await app.inject({
      method: 'POST',
      url: '/staff/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    const next = refreshed.json<StaffRefreshTokenResponse>().refreshToken;

    const out = await app.inject({
      method: 'POST',
      url: '/staff/auth/sign-out',
      payload: { refreshToken: next },
    });
    expect(out.statusCode).toBe(204);
    const again = await app.inject({
      method: 'POST',
      url: '/staff/auth/refresh',
      payload: { refreshToken: next },
    });
    expect(again.statusCode).toBe(401);
  });
});
