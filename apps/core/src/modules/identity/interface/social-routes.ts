import { socialSignInRequestSchema } from '@wagonwise/contracts/identity';
import type { FastifyInstance } from 'fastify';
import { socialSignIn, type SocialSignInDeps } from '../application/social-sign-in.js';
import { statusFor } from './error-mapping.js';

/**
 * `POST /identity/social/sign-in` (docs/driver-sign-in-plan.md). Registered only when `DRIVER_PASSWORD_SIGN_IN` is on; a provider with no
 * client id set answers 503 `ProviderNotConfigured`. Same conventions as `routes.ts`: an internal endpoint, forwarded unchanged by the driver BFF.
 */
export function registerSocialRoutes(app: FastifyInstance, deps: SocialSignInDeps): void {
  app.post('/identity/social/sign-in', async (request, reply) => {
    const parsed = socialSignInRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await socialSignIn(deps, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    const { driver, accessToken, refreshToken } = result.value;
    return reply.status(200).send({
      accessToken,
      refreshToken,
      driver: {
        id: driver.id,
        identifier: driver.identifier,
        createdAt: driver.createdAt,
        ...(driver.name === undefined ? {} : { name: driver.name }),
        ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
        // Always false and empty, as in `routes.ts`: the field stays for released app builds.
        isAdmin: false,
        scopes: [],
      },
    });
  });
}
