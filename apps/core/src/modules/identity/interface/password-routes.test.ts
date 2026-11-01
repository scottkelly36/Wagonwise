import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { InMemoryUnitOfWork } from '../../../shared/testing/in-memory-unit-of-work.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { PasswordAccountDeps } from '../application/password-accounts.js';
import { FakeOtpSender } from '../application/testing/fake-otp-sender.js';
import { FakePasswordHasher } from '../application/testing/fake-password-hasher.js';
import { FakeTokenSigner } from '../application/testing/fake-token-signer.js';
import { InMemoryCredentialRepository } from '../application/testing/in-memory-credential-repository.js';
import { InMemoryDriverRepository } from '../application/testing/in-memory-driver-repository.js';
import { InMemoryInviteCodeRepository } from '../application/testing/in-memory-invite-code-repository.js';
import { InMemoryOtpRepository } from '../application/testing/in-memory-otp-repository.js';
import { InMemorySessionRepository } from '../application/testing/in-memory-session-repository.js';
import { SequentialOtpCodeGenerator } from '../application/testing/sequential-otp-code-generator.js';
import { SequentialRefreshTokenGenerator } from '../application/testing/sequential-refresh-token-generator.js';
import { registerPasswordRoutes } from './password-routes.js';

const DRIVER_HEADER = 'x-test-driver-id';
const EMAIL = 'sam@example.com';
const PASSWORD = 'a long enough password';

function buildApp(): { app: FastifyInstance; deps: PasswordAccountDeps; sender: FakeOtpSender } {
  const sender = new FakeOtpSender();
  const deps: PasswordAccountDeps = {
    driverRepo: new InMemoryDriverRepository(),
    inviteCodeRepo: new InMemoryInviteCodeRepository(),
    credentialRepo: new InMemoryCredentialRepository(),
    otpRepo: new InMemoryOtpRepository(),
    otpSender: sender,
    otpCodeGenerator: new SequentialOtpCodeGenerator(),
    passwordHasher: new FakePasswordHasher(),
    sessionRepo: new InMemorySessionRepository(),
    tokenSigner: new FakeTokenSigner(),
    refreshTokenGenerator: new SequentialRefreshTokenGenerator(),
    unitOfWork: new InMemoryUnitOfWork(),
    inviteRequired: false,
    clock: new FakeClock('2026-11-01T09:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  const app = Fastify();
  // Stands in for core's driver-auth hook, which sets `request.driverId` from a verified token.
  app.decorateRequest('driverId', undefined);
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') request.driverId = driverId;
    done();
  });
  registerPasswordRoutes(app, deps);
  return { app, deps, sender };
}

describe('the email-and-password routes', () => {
  let app: FastifyInstance;
  let deps: PasswordAccountDeps;
  let sender: FakeOtpSender;
  beforeEach(() => ({ app, deps, sender } = buildApp()));

  const post = (url: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url, payload });

  it('signs up with a code, then signs in with the password and a code', async () => {
    expect((await post('/identity/signup/request', { email: EMAIL })).statusCode).toBe(200);
    const signUp = await post('/identity/signup/confirm', {
      email: EMAIL,
      password: PASSWORD,
      code: sender.sent.at(-1)?.code,
    });
    expect(signUp.statusCode).toBe(200);
    expect(signUp.json()).toMatchObject({
      driver: { identifier: EMAIL, isAdmin: false, scopes: [] },
    });
    expect(signUp.json<{ accessToken: string }>().accessToken).toBeTruthy();

    expect(
      (await post('/identity/password/sign-in', { identifier: EMAIL, password: PASSWORD }))
        .statusCode,
    ).toBe(200);
    const verified = await post('/identity/password/verify', {
      identifier: EMAIL,
      code: sender.sent.at(-1)?.code,
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json<{ refreshToken: string }>().refreshToken).toBeTruthy();
  });

  it('answers a wrong password 401 InvalidCredentials, and a taken address 409 AccountExists', async () => {
    await post('/identity/signup/request', { email: EMAIL });
    await post('/identity/signup/confirm', {
      email: EMAIL,
      password: PASSWORD,
      code: sender.sent.at(-1)?.code,
    });
    const wrong = await post('/identity/password/sign-in', {
      identifier: EMAIL,
      password: 'nope nope nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ tag: 'InvalidCredentials' });
    const taken = await post('/identity/signup/request', { email: EMAIL });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ tag: 'AccountExists' });
  });

  it('400s a malformed body and a weak password', async () => {
    expect((await post('/identity/signup/request', { nonsense: true })).statusCode).toBe(400);
    await post('/identity/signup/request', { email: EMAIL });
    const weak = await post('/identity/signup/confirm', {
      email: EMAIL,
      password: 'short',
      code: sender.sent.at(-1)?.code,
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json()).toMatchObject({ tag: 'PasswordTooShort' });
  });

  it('502s with CodeNotSent, and no provider detail, when the code cannot be sent', async () => {
    const failing = {
      ...deps,
      otpSender: { send: () => Promise.reject(new Error('Resend 403: domain not verified')) },
    };
    const failApp = Fastify();
    registerPasswordRoutes(failApp, failing);
    const response = await failApp.inject({
      method: 'POST',
      url: '/identity/signup/request',
      payload: { email: EMAIL },
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toMatch(/Resend|domain/);
  });

  it('always 200s a password reset request, whether or not the address has an account', async () => {
    expect(
      (await post('/identity/password/reset/request', { email: 'nobody@example.com' })).statusCode,
    ).toBe(200);
    expect(sender.sent).toEqual([]);
  });

  it('adds a password for a signed-in driver, and 401s without one', async () => {
    const id = makeId<'DriverId'>('driver-1');
    await deps.driverRepo.save({ id, identifier: EMAIL, createdAt: new Date() });

    const anonymous = await app.inject({
      method: 'PUT',
      url: '/identity/account/password',
      payload: { password: PASSWORD },
    });
    expect(anonymous.statusCode).toBe(401);

    const added = await app.inject({
      method: 'PUT',
      url: '/identity/account/password',
      payload: { password: PASSWORD },
      headers: { [DRIVER_HEADER]: id },
    });
    expect(added.statusCode).toBe(204);
    expect((await deps.credentialRepo.findByDriverId(id))?.passwordHash).toBe(`hashed:${PASSWORD}`);

    const again = await app.inject({
      method: 'PUT',
      url: '/identity/account/password',
      payload: { password: PASSWORD },
      headers: { [DRIVER_HEADER]: id },
    });
    expect(again.statusCode).toBe(409);
  });
});
