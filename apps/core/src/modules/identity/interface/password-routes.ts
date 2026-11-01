import {
  confirmSignupRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestRequestSchema,
  passwordSignInRequestSchema,
  passwordVerifyRequestSchema,
  setPasswordRequestSchema,
  signupRequestRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  confirmPasswordReset,
  confirmSignup,
  passwordSignIn,
  requestPasswordReset,
  requestSignupCode,
  setPassword,
  verifyPasswordSignIn,
  type PasswordAccountDeps,
  type SignedIn,
} from '../application/password-accounts.js';
import { statusFor, type IdentityError } from './error-mapping.js';

function driverDto(driver: SignedIn['driver']) {
  return {
    id: driver.id,
    identifier: driver.identifier,
    createdAt: driver.createdAt,
    ...(driver.name === undefined ? {} : { name: driver.name }),
    ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
    // Always false and empty, as in `routes.ts`: the field stays for released app builds.
    isAdmin: false,
    scopes: [],
  };
}

function signedInBody(signedIn: SignedIn) {
  return {
    accessToken: signedIn.accessToken,
    refreshToken: signedIn.refreshToken,
    driver: driverDto(signedIn.driver),
  };
}

function failure(request: FastifyRequest, reply: FastifyReply, error: IdentityError) {
  if (error.tag === 'CodeNotSent') {
    // Why it failed (the provider's own message) goes to the log, not to the caller.
    request.log.error({ err: error.cause }, 'could not send sign-in code');
    return reply.status(statusFor(error)).send({ tag: 'CodeNotSent', requestId: request.id });
  }
  return reply.status(statusFor(error)).send({ ...error, requestId: request.id });
}

const invalidRequest = (request: FastifyRequest, reply: FastifyReply) =>
  reply.status(400).send({ error: 'invalid_request', requestId: request.id });

/**
 * Email-and-password sign-in routes (docs/driver-sign-in-plan.md). Registered only when `DRIVER_PASSWORD_SIGN_IN` is on. Same
 * conventions as `routes.ts`: internal endpoints behind core's `X-Internal-Key`, forwarded unchanged by the driver BFF.
 */
export function registerPasswordRoutes(app: FastifyInstance, deps: PasswordAccountDeps): void {
  app.post('/identity/signup/request', async (request, reply) => {
    const parsed = signupRequestRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await requestSignupCode(deps, parsed.data);
    return result.ok ? reply.status(200).send({}) : failure(request, reply, result.error);
  });

  app.post('/identity/signup/confirm', async (request, reply) => {
    const parsed = confirmSignupRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await confirmSignup(deps, parsed.data);
    return result.ok
      ? reply.status(200).send(signedInBody(result.value))
      : failure(request, reply, result.error);
  });

  app.post('/identity/password/sign-in', async (request, reply) => {
    const parsed = passwordSignInRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await passwordSignIn(deps, parsed.data);
    return result.ok ? reply.status(200).send({}) : failure(request, reply, result.error);
  });

  app.post('/identity/password/verify', async (request, reply) => {
    const parsed = passwordVerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await verifyPasswordSignIn(deps, parsed.data);
    return result.ok
      ? reply.status(200).send(signedInBody(result.value))
      : failure(request, reply, result.error);
  });

  app.post('/identity/password/reset/request', async (request, reply) => {
    const parsed = passwordResetRequestRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await requestPasswordReset(deps, parsed.data);
    return result.ok ? reply.status(200).send({}) : failure(request, reply, result.error);
  });

  app.post('/identity/password/reset/confirm', async (request, reply) => {
    const parsed = passwordResetConfirmRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await confirmPasswordReset(deps, parsed.data);
    return result.ok
      ? reply.status(200).send(signedInBody(result.value))
      : failure(request, reply, result.error);
  });

  // A signed-in driver adds a password. Under `/identity/account/`, which core's driver-auth hook already gates, so the driver id is
  // the verified token's own claim.
  app.put('/identity/account/password', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const parsed = setPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalidRequest(request, reply);
    const result = await setPassword(deps, {
      driverId: makeId<'DriverId'>(request.driverId),
      password: parsed.data.password,
    });
    return result.ok ? reply.status(204).send() : failure(request, reply, result.error);
  });
}
