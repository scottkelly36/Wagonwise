import {
  refreshTokenRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  verifyOtpRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import type { CoreClient } from './core-client.js';

export interface IdentityRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

const BEARER_PREFIX = 'Bearer ';

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
}

/**
 * Auth verification, request shaping, forwarding — nothing else (AGENTS.md rule 10). Every route
 * validates its body/params against the same `@wagonwise/contracts` schemas core does, then
 * relays core's status and body back unchanged; core is what actually decides anything.
 */
export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRouteDeps): void {
  app.post('/identity/otp/request', async (request, reply) => {
    const parsed = requestOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/identity/otp/request', request.id, {
      body: parsed.data,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/identity/otp/verify', async (request, reply) => {
    const parsed = verifyOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/identity/otp/verify', request.id, {
      body: parsed.data,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/identity/token/refresh', async (request, reply) => {
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/identity/token/refresh', request.id, {
      body: parsed.data,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/identity/sessions/:id/revoke', async (request, reply) => {
    const parsed = revokeSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: 'missing_bearer_token', requestId: request.id });
    }

    let claims;
    try {
      claims = await deps.accessTokenVerifier.verify(token);
    } catch {
      return reply.status(401).send({ error: 'invalid_access_token', requestId: request.id });
    }

    if (claims.sessionId !== parsed.data.id) {
      // A driver may self-service-revoke their own *current* session through this route, not an
      // arbitrary one by guessing its id — the concrete case "BFFs verify tokens" is meant to
      // cover, not just check a signature and forward blindly.
      return reply.status(403).send({ error: 'session_mismatch', requestId: request.id });
    }

    const core = await deps.coreClient.request(
      'POST',
      `/identity/sessions/${parsed.data.id}/revoke`,
      request.id,
    );
    return reply.status(core.status).send(core.body);
  });
}
