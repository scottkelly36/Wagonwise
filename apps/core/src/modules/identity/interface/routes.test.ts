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
import { SequentialInviteCodeGenerator } from '../application/testing/sequential-invite-code-generator.js';
import { SequentialOtpCodeGenerator } from '../application/testing/sequential-otp-code-generator.js';
import { SequentialRefreshTokenGenerator } from '../application/testing/sequential-refresh-token-generator.js';
import { StubPlatformStaff } from '../application/testing/stub-platform-staff.js';
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

// The WagonWise-admin screens take a staff token (P2-M1.12c); staff-auth.ts's hook sets
// `request.staffId`, stood in for the same way.
const STAFF_HEADER = 'x-test-staff-id';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const FLEET_STAFF_ID = '44444444-4444-4444-8444-444444444444';

function asStaff(staffId: string): { headers: Record<string, string> } {
  return { headers: { [STAFF_HEADER]: staffId } };
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
  const staff = new StubPlatformStaff(new Set([makeId<'StaffId'>(ADMIN_ID)]));

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
    listDrivers: { driverRepo, staff },
    updateDriver: { driverRepo, staff },
    createInviteCode: {
      repo: inviteCodeRepo,
      generator: new SequentialInviteCodeGenerator(),
      clock,
      staff,
    },
    listInviteCodes: { repo: inviteCodeRepo, staff },
    tokenSigner,
  };

  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
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

describe('GET /staff/drivers', () => {
  async function seedDrivers(deps: IdentityRouteDeps): Promise<void> {
    for (const [id, identifier] of [
      ['driver-1', 'one@example.com'],
      ['driver-2', 'two@example.com'],
    ] as const) {
      await deps.requestOtp.driverRepo.save({
        id: makeId<'DriverId'>(id),
        identifier,
        createdAt: now,
      });
    }
  }

  it('200s with every driver for a WagonWise admin, still sending the old admin fields', async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'GET',
      url: '/staff/drivers',
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    const drivers = response.json<{ drivers: unknown[] }>().drivers;
    expect(drivers).toHaveLength(2);
    // Released driver-app builds still parse these two fields; they are fixed now.
    expect(drivers[0]).toMatchObject({ isAdmin: false, scopes: [] });
  });

  it("403s a company's staff", async () => {
    const { app, deps } = buildApp();
    await seedDrivers(deps);

    const response = await app.inject({
      method: 'GET',
      url: '/staff/drivers',
      ...asStaff(FLEET_STAFF_ID),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ tag: 'Forbidden' });
  });

  it('401s a driver token, or none', async () => {
    const { app } = buildApp();
    const none = await app.inject({ method: 'GET', url: '/staff/drivers' });
    expect(none.statusCode).toBe(401);
    const driver = await app.inject({
      method: 'GET',
      url: '/staff/drivers',
      ...asDriver('driver-1'),
    });
    expect(driver.statusCode).toBe(401);
  });
});

describe('PATCH /staff/drivers/:id', () => {
  const DRIVER_ID = '22222222-2222-4222-8222-222222222222';

  async function seedDriver(deps: IdentityRouteDeps, companyId?: string): Promise<void> {
    await deps.requestOtp.driverRepo.save({
      id: makeId<'DriverId'>(DRIVER_ID),
      identifier: 'driver@example.com',
      createdAt: now,
      ...(companyId === undefined ? {} : { companyId: makeId<'CompanyId'>(companyId) }),
    });
  }

  it('200s and assigns a company, for a WagonWise admin', async () => {
    const { app, deps } = buildApp();
    await seedDriver(deps);

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/drivers/${DRIVER_ID}`,
      payload: { companyId: 'company-1' },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ companyId: 'company-1' });
  });

  it('clears a company assignment with companyId: null', async () => {
    const { app, deps } = buildApp();
    await seedDriver(deps, 'company-1');

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/drivers/${DRIVER_ID}`,
      payload: { companyId: null },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('companyId');
  });

  it("403s a company's staff, changing nothing", async () => {
    const { app, deps } = buildApp();
    await seedDriver(deps, 'company-1');

    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/drivers/${DRIVER_ID}`,
      payload: { companyId: 'company-2' },
      ...asStaff(FLEET_STAFF_ID),
    });
    expect(response.statusCode).toBe(403);

    const driver = await deps.requestOtp.driverRepo.findById(makeId<'DriverId'>(DRIVER_ID));
    expect(driver?.companyId).toBe('company-1');
  });

  it('401s with no staff token', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/staff/drivers/${DRIVER_ID}`,
      payload: { companyId: null },
    });
    expect(response.statusCode).toBe(401);
  });

  it('404s an unknown driver id, for a WagonWise admin', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/staff/drivers/33333333-3333-4333-8333-333333333333',
      payload: { companyId: null },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ tag: 'DriverNotFound' });
  });

  it('400s a non-UUID id', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/staff/drivers/not-a-uuid',
      payload: { companyId: null },
      ...asStaff(ADMIN_ID),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('/staff/invite-codes', () => {
  it('201s a fresh, unredeemed code for a WagonWise admin, and lists them all', async () => {
    const { app } = buildApp();

    const created = await app.inject({
      method: 'POST',
      url: '/staff/invite-codes',
      ...asStaff(ADMIN_ID),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: 'CODE1', redeemedBy: null, redeemedAt: null });
    await app.inject({ method: 'POST', url: '/staff/invite-codes', ...asStaff(ADMIN_ID) });

    const listed = await app.inject({
      method: 'GET',
      url: '/staff/invite-codes',
      ...asStaff(ADMIN_ID),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ inviteCodes: unknown[] }>().inviteCodes).toHaveLength(2);
  });

  it.each(['POST', 'GET'] as const)("%s 403s a company's staff", async (method) => {
    const { app } = buildApp();
    const response = await app.inject({
      method,
      url: '/staff/invite-codes',
      ...asStaff(FLEET_STAFF_ID),
    });
    expect(response.statusCode).toBe(403);
  });

  it.each(['POST', 'GET'] as const)('%s 401s with no staff token', async (method) => {
    const { app } = buildApp();
    const response = await app.inject({ method, url: '/staff/invite-codes' });
    expect(response.statusCode).toBe(401);
  });

  it('the old driver-token routes are gone', async () => {
    const { app } = buildApp();
    for (const [method, url] of [
      ['GET', '/identity/drivers'],
      ['POST', '/identity/invite-codes'],
      ['GET', '/identity/invite-codes'],
    ] as const) {
      const response = await app.inject({ method, url, ...asDriver('driver-1') });
      expect(response.statusCode).toBe(404);
    }
  });
});
