import {
  addEmailRequestSchema,
  confirmEmailRequestSchema,
  linkSocialRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  confirmEmailAddition,
  linkSocial,
  requestEmailAddition,
  type AccountLinkDeps,
} from '../application/account-links.js';
import { statusFor, type IdentityError } from './error-mapping.js';

function failure(request: FastifyRequest, reply: FastifyReply, error: IdentityError) {
  if (error.tag === 'CodeNotSent') {
    // Why it failed (the provider's own message) goes to the log, not to the caller.
    request.log.error({ err: error.cause }, 'could not send sign-in code');
    return reply.status(statusFor(error)).send({ tag: 'CodeNotSent', requestId: request.id });
  }
  return reply.status(statusFor(error)).send({ ...error, requestId: request.id });
}

/**
 * A signed-in driver adds sign-in methods to their account (docs/driver-sign-in-plan.md): a Google or Apple login, or an email for an
 * account made with a phone number. Under `/identity/account/`, which core's driver-auth hook already gates, so the driver id is the
 * verified token's own claim, never a body field. Registered only when `DRIVER_PASSWORD_SIGN_IN` is on.
 */
export function registerAccountLinkRoutes(app: FastifyInstance, deps: AccountLinkDeps): void {
  const driverIdOf = (request: FastifyRequest, reply: FastifyReply) => {
    if (request.driverId === undefined) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    return makeId<'DriverId'>(request.driverId);
  };
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });

  app.post('/identity/account/link/social', async (request, reply) => {
    const driverId = driverIdOf(request, reply);
    if (driverId === undefined) return reply;
    const parsed = linkSocialRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(request, reply);
    const result = await linkSocial(deps, { driverId, ...parsed.data });
    return result.ok ? reply.status(204).send() : failure(request, reply, result.error);
  });

  app.post('/identity/account/email/request', async (request, reply) => {
    const driverId = driverIdOf(request, reply);
    if (driverId === undefined) return reply;
    const parsed = addEmailRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(request, reply);
    const result = await requestEmailAddition(deps, { driverId, email: parsed.data.email });
    return result.ok ? reply.status(200).send({}) : failure(request, reply, result.error);
  });

  app.post('/identity/account/email/confirm', async (request, reply) => {
    const driverId = driverIdOf(request, reply);
    if (driverId === undefined) return reply;
    const parsed = confirmEmailRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(request, reply);
    const result = await confirmEmailAddition(deps, { driverId, ...parsed.data });
    if (!result.ok) return failure(request, reply, result.error);
    const driver = result.value;
    return reply.status(200).send({
      id: driver.id,
      identifier: driver.identifier,
      createdAt: driver.createdAt,
      ...(driver.name === undefined ? {} : { name: driver.name }),
      ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
      // Always false and empty, as in `routes.ts`: the field stays for released app builds.
      isAdmin: false,
      scopes: [],
    });
  });
}
