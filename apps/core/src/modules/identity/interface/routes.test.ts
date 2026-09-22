import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { InviteCode } from '../domain/invite-code.js';
import { InMemoryDriverRepository } from '../application/testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from '../application/testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from '../application/testing/in-memory-otp-repository.js';
import { InMemorySessionRepository } from '../application/testing/in-memory-session-repository.js';
import { FakeOtpSender } from '../application/testing/fake-otp-sender.js';
import { FakeTokenSigner } from '../application/testing/fake-token-signer.js';
import { SequentialOtpCodeGenerator } from '../application/testing/sequential-otp-code-generator.js';
import { SequentialRefreshTokenGenerator } from '../application/testing/sequential-refresh-token-generator.js';
import { registerIdentityRoutes, type IdentityRouteDeps } from './routes.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function buildApp(): { app: FastifyInstance; deps: IdentityRouteDeps } {
  const driverRepo = new InMemoryDriverRepository();
  const inviteCodeRepo = new InMemoryInviteCodeRepository();
  const otpRepo = new InMemoryOtpRepository();
  const sessionRepo = new InMemorySessionRepository();
  const clock = new FakeClock(now);
  const ids = new SequentialIdGenerator();
  const tokenSigner = new FakeTokenSigner();
  const refreshTokenGenerator = new SequentialRefreshTokenGenerator();

  const deps: IdentityRouteDeps = {
    requestOtp: {
      driverRepo,
      inviteCodeRepo,
      otpRepo,
      otpSender: new FakeOtpSender(),
      otpCodeGenerator: new SequentialOtpCodeGenerator(),
      clock,
      ids,
    },
    verifyOtp: {
      driverRepo,
      inviteCodeRepo,
      otpRepo,
      sessionRepo,
      tokenSigner,
      refreshTokenGenerator,
      unitOfWork: new InMemoryUnitOfWork(),
      clock,
      ids,
    },
    refreshToken: { sessionRepo, tokenSigner, refreshTokenGenerator, clock },
    revokeSession: { sessionRepo, clock },
    tokenSigner,
  };

  const app = Fastify();
  registerIdentityRoutes(app, deps);
  return { app, deps };
}

describe('POST /identity/otp/request', () => {
  let app: FastifyInstance;
  let deps: IdentityRouteDeps;
  beforeEach(() => ({ app, deps } = buildApp()));

  it('200s for an existing driver', async () => {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'driver@example.com' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('400s a malformed body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { nonsense: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('400s InviteCodeRequired for a new identifier with no invite code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'new@example.com' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ tag: 'InviteCodeRequired' });
  });
});

describe('POST /identity/otp/verify', () => {
  let app: FastifyInstance;
  let deps: IdentityRouteDeps;
  beforeEach(() => ({ app, deps } = buildApp()));

  it('200s with tokens for the right code', async () => {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
    });
    await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'driver@example.com' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'driver@example.com', code: '000001' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      accessToken: string;
      refreshToken: string;
      driver: { identifier: string };
    }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.driver.identifier).toBe('driver@example.com');
  });

  it('401s an incorrect code, with attemptsRemaining in the body', async () => {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
    });
    await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'driver@example.com' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'driver@example.com', code: '999999' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ tag: 'OtpIncorrect', attemptsRemaining: 4 });
  });

  it('404s when no code was ever requested', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'nobody@example.com', code: '000001' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'OtpNotFound' });
  });

  it('creates a driver and redeems the invite code for a first sign-in', async () => {
    const invite: InviteCode = {
      code: 'HEXHAM24',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: now,
    };
    await deps.requestOtp.inviteCodeRepo.save(invite);
    await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'new@example.com', inviteCode: 'HEXHAM24' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'new@example.com', code: '000001', inviteCode: 'HEXHAM24' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ driver: { identifier: string } }>().driver.identifier).toBe(
      'new@example.com',
    );
  });
});

describe('POST /identity/token/refresh', () => {
  it('200s and rotates on a valid refresh token', async () => {
    const { app, deps } = buildApp();
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
    });
    await app.inject({
      method: 'POST',
      url: '/identity/otp/request',
      payload: { identifier: 'driver@example.com' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/identity/otp/verify',
      payload: { identifier: 'driver@example.com', code: '000001' },
    });
    const { refreshToken } = verify.json<{ refreshToken: string }>();

    const response = await app.inject({
      method: 'POST',
      url: '/identity/token/refresh',
      payload: { refreshToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ accessToken: string; refreshToken: string }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('404s an unknown token', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/token/refresh',
      payload: { refreshToken: 'never-issued' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'SessionNotFound' });
  });
});

describe('POST /identity/sessions/:id/revoke', () => {
  it('204s and revokes the session', async () => {
    const { app, deps } = buildApp();
    const session = {
      id: makeId<'SessionId'>('11111111-1111-4111-8111-111111111111'),
      driverId: makeId<'DriverId'>('driver-1'),
      refreshTokenHash: 'hash',
      previousRefreshTokenHash: null,
      issuedAt: now,
      lastUsedAt: now,
      refreshExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
      revokedAt: null,
    };
    await deps.revokeSession.sessionRepo.save(session);

    const response = await app.inject({
      method: 'POST',
      url: `/identity/sessions/${session.id}/revoke`,
    });
    expect(response.statusCode).toBe(204);
    const saved = await deps.revokeSession.sessionRepo.findById(session.id);
    expect(saved?.revokedAt).toEqual(now);
  });

  it('400s a non-UUID session id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/sessions/not-a-uuid/revoke',
    });
    expect(response.statusCode).toBe(400);
  });

  it('404s an unknown (but well-formed) session id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/sessions/22222222-2222-4222-8222-222222222222/revoke',
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /identity/.well-known/jwks.json', () => {
  it('publishes the public key, never a private one', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/identity/.well-known/jwks.json' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ keys: Record<string, unknown>[] }>();
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]).not.toHaveProperty('d');
  });
});
