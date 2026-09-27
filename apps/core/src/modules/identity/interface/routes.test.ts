import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { InviteCode } from '../domain/invite-code.js';
import { InMemoryDeviceRepository } from '../application/testing/in-memory-device-repository.js';
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

// `driverId` for POST /identity/devices comes from `request.driverId` (host/driver-auth.ts's
// hook, M6.2), never a body field. This suite isn't exercising that hook — driver-auth.test.ts
// already does, against real verification — so it stands in for it with a trivial one keyed off
// a plain test header, matching routing's/hazards'/feedback's own routes.test.ts convention.
const DRIVER_HEADER = 'x-test-driver-id';

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

function buildApp(): { app: FastifyInstance; deps: IdentityRouteDeps } {
  const driverRepo = new InMemoryDriverRepository();
  const inviteCodeRepo = new InMemoryInviteCodeRepository();
  const otpRepo = new InMemoryOtpRepository();
  const sessionRepo = new InMemorySessionRepository();
  const deviceRepo = new InMemoryDeviceRepository();
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
    registerDevice: { repo: deviceRepo, clock, ids },
    giveConsent: { driverRepo, clock },
    deleteAccount: { driverRepo, sessionRepo, deviceRepo, clock },
    listDrivers: { driverRepo },
    updateDriver: { driverRepo },
    driverRepo,
    tokenSigner,
  };

  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    done();
  });
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
      isAdmin: false,
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
      isAdmin: false,
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
      isAdmin: false,
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
      isAdmin: false,
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

describe('POST /identity/devices', () => {
  it('201s and returns the registered device', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { pushToken: 'ExponentPushToken[abc123]' },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      driverId: 'driver-1',
      pushToken: 'ExponentPushToken[abc123]',
    });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { pushToken: 'ExponentPushToken[abc123]' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('reassigns an already-registered token to the new caller rather than duplicating it', async () => {
    const { app } = buildApp();
    const first = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { pushToken: 'shared-token' },
      ...asDriver('driver-1'),
    });
    const { id: firstId } = first.json<{ id: string }>();

    const second = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { pushToken: 'shared-token' },
      ...asDriver('driver-2'),
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toMatchObject({ id: firstId, driverId: 'driver-2' });
  });
});

describe('POST /identity/consent', () => {
  it('200s and returns the driver with consentedAt set', async () => {
    const { app, deps } = buildApp();
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/identity/consent',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'driver-1',
      consentedAt: now.toISOString(),
    });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'POST', url: '/identity/consent' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('404s an unknown driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/identity/consent',
      ...asDriver('nope'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'DriverNotFound' });
  });
});

describe('DELETE /identity/account', () => {
  it('204s and anonymizes the driver, revoking sessions and devices', async () => {
    const { app, deps } = buildApp();
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
    });
    await deps.registerDevice.repo.save({
      id: makeId<'DeviceId'>('device-1'),
      driverId: makeId<'DriverId'>('driver-1'),
      pushToken: 'ExponentPushToken[abc123]',
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/identity/account',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(204);

    const driver = await deps.requestOtp.driverRepo.findById(makeId<'DriverId'>('driver-1'));
    expect(driver?.identifier).toBe('deleted:driver-1');
    expect(driver?.deletedAt).toEqual(now);
    expect(await deps.registerDevice.repo.findByDriverId(makeId<'DriverId'>('driver-1'))).toEqual(
      [],
    );
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'DELETE', url: '/identity/account' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('404s an unknown driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/identity/account',
      ...asDriver('nope'),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'DriverNotFound' });
  });

  it('is idempotent: a second delete still 204s', async () => {
    const { app, deps } = buildApp();
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
    });

    await app.inject({ method: 'DELETE', url: '/identity/account', ...asDriver('driver-1') });
    const second = await app.inject({
      method: 'DELETE',
      url: '/identity/account',
      ...asDriver('driver-1'),
    });
    expect(second.statusCode).toBe(204);
  });
});

describe('GET /identity/drivers', () => {
  async function seedDrivers(deps: IdentityRouteDeps): Promise<void> {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('admin-driver'),
      identifier: 'admin@example.com',
      createdAt: now,
      isAdmin: true,
    });
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>('driver-1'),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
    });
  }

  it('200s with every driver for an admin', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'GET',
      url: '/identity/drivers',
      ...asDriver('admin-driver'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ drivers: unknown[] }>().drivers).toHaveLength(2);
  });

  it('403s a non-admin driver', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'GET',
      url: '/identity/drivers',
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({ method: 'GET', url: '/identity/drivers' });
    expect(response.statusCode).toBe(401);
  });
});

describe('PATCH /identity/drivers/:id', () => {
  // Unlike the caller's own `driverId` (a plain header value in this test suite, per the file's
  // own convention above), the *target* id here is a real URL param parsed by
  // `driverIdParamsSchema` (`z.uuid()`) — so both the admin's own id and the target driver's id
  // need to actually look like UUIDs, not the arbitrary strings ('driver-1' etc.) every other
  // describe block in this file uses for a caller.
  const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
  const DRIVER_ID = '22222222-2222-4222-8222-222222222222';

  async function seedDrivers(deps: IdentityRouteDeps): Promise<void> {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>(ADMIN_ID),
      identifier: 'admin@example.com',
      createdAt: now,
      isAdmin: true,
    });
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>(DRIVER_ID),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
    });
  }

  it('200s and assigns a company, for an admin', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: `/identity/drivers/${DRIVER_ID}`,
      payload: { companyId: 'company-1' },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ companyId: 'company-1' });
  });

  it('clears a company assignment with companyId: null', async () => {
    const { app, deps } = buildApp();
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>(ADMIN_ID),
      identifier: 'admin@example.com',
      createdAt: now,
      isAdmin: true,
    });
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>(DRIVER_ID),
      identifier: 'driver@example.com',
      createdAt: now,
      isAdmin: false,
      companyId: makeId<'CompanyId'>('company-1'),
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/identity/drivers/${DRIVER_ID}`,
      payload: { companyId: null },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('companyId');
  });

  it('sets isAdmin', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: `/identity/drivers/${DRIVER_ID}`,
      payload: { isAdmin: true },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ isAdmin: true });
  });

  it('403s a non-admin driver, changing nothing', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: `/identity/drivers/${ADMIN_ID}`,
      payload: { isAdmin: false },
      ...asDriver(DRIVER_ID),
    });
    expect(response.statusCode).toBe(403);

    const admin = await deps.requestOtp.driverRepo.findById(makeId<'DriverId'>(ADMIN_ID));
    expect(admin?.isAdmin).toBe(true);
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/identity/drivers/${DRIVER_ID}`,
      payload: { isAdmin: true },
    });
    expect(response.statusCode).toBe(401);
  });

  it('404s an unknown driver id, for an admin', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: '/identity/drivers/33333333-3333-4333-8333-333333333333',
      payload: { isAdmin: true },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'DriverNotFound' });
  });

  it('400s a non-UUID id, for an admin', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: '/identity/drivers/not-a-uuid',
      payload: { isAdmin: true },
      ...asDriver(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});
