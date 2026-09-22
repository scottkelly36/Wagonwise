import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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

// Inline for now — packages/contracts (zod schemas shared across app/BFF/core, AGENTS.md rule
// 11) arrives in M1.6. These are core-only until then, not yet the shared source of truth.
const requestOtpBody = z.object({
  identifier: z.string(),
  inviteCode: z.string().optional(),
});
const verifyOtpBody = z.object({
  identifier: z.string(),
  code: z.string(),
  inviteCode: z.string().optional(),
});
const refreshTokenBody = z.object({
  refreshToken: z.string(),
});
const sessionIdParam = z.object({
  id: z.uuid(),
});

/**
 * Internal endpoints (design doc §9) — core is not publicly exposed, so these are reachable only
 * by a trusted BFF (decision 11's X-Internal-Key is BFF<->core network security, not specific to
 * identity, and isn't wired yet — a driver-facing auth check on e.g. the revoke route is the
 * calling BFF's job, per "BFFs verify tokens", once one exists in M1.6).
 */
export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRouteDeps): void {
  app.post('/identity/otp/request', async (request, reply) => {
    const parsed = requestOtpBody.safeParse(request.body);
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
    const parsed = verifyOtpBody.safeParse(request.body);
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
    const parsed = refreshTokenBody.safeParse(request.body);
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
    const parsed = sessionIdParam.safeParse(request.params);
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
