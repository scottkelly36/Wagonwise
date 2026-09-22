import {
  refreshTokenRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  verifyOtpRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import { refreshToken, type RefreshTokenDeps } from '../application/refresh-token.js';
import { requestOtp, type RequestOtpDeps } from '../application/request-otp.js';
import { revokeSession, type RevokeSessionDeps } from '../application/revoke-session.js';
import { verifyOtp, type VerifyOtpDeps } from '../application/verify-otp.js';
import type { TokenSigner } from '../application/ports/token-signer.js';
import { statusFor } from './error-mapping.js';

export interface IdentityRouteDeps {
  readonly requestOtp: RequestOtpDeps;
  readonly verifyOtp: VerifyOtpDeps;
  readonly refreshToken: RefreshTokenDeps;
  readonly revokeSession: RevokeSessionDeps;
  readonly tokenSigner: TokenSigner;
}

/**
 * Internal endpoints (design doc §9) — core is not publicly exposed, so these are reachable only
 * by a trusted BFF, enforced at the host level (decision 11's `X-Internal-Key`, wired in
 * `host/internal-auth.ts`, M1.6). A driver-facing auth check on e.g. the revoke route is the
 * calling BFF's job, per "BFFs verify tokens" — `apps/driver-bff` does that before it ever
 * reaches here.
 */
export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRouteDeps): void {
  app.post('/identity/otp/request', async (request, reply) => {
    const parsed = requestOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await requestOtp(deps.requestOtp, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({});
  });

  app.post('/identity/otp/verify', async (request, reply) => {
    const parsed = verifyOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await verifyOtp(deps.verifyOtp, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      accessToken: result.value.accessToken,
      refreshToken: result.value.refreshToken,
      driver: {
        id: result.value.driver.id,
        identifier: result.value.driver.identifier,
        createdAt: result.value.driver.createdAt,
      },
    });
  });

  app.post('/identity/token/refresh', async (request, reply) => {
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await refreshToken(deps.refreshToken, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.post('/identity/sessions/:id/revoke', async (request, reply) => {
    const parsed = revokeSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await revokeSession(deps.revokeSession, {
      sessionId: makeId<'SessionId'>(parsed.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  // A BFF caches this and verifies tokens locally (decision 1) — core is the only thing that can
  // sign, everything else can only check a signature against this.
  app.get('/identity/.well-known/jwks.json', async (_request, reply) => {
    const jwk = await deps.tokenSigner.publicJwk();
    return reply.status(200).send({ keys: [jwk] });
  });
}
