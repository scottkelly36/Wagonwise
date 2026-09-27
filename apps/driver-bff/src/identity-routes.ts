import {
  driverIdParamsSchema,
  refreshTokenRequestSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  updateDriverRequestSchema,
  verifyOtpRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
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

  app.post('/identity/devices', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = registerDeviceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/identity/devices', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/identity/consent', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('POST', '/identity/consent', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.delete('/identity/account', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('DELETE', '/identity/account', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  // The dashboard's user-management screen (2026-09-27) — core decides who's allowed to (the
  // admin gate lives in identity/interface/routes.ts), this route knows nothing about that, same
  // "validate, authenticate, forward, relay unchanged" shape as every other route here.
  app.get('/identity/drivers', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('GET', '/identity/drivers', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.patch('/identity/drivers/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = driverIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const body = updateDriverRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'PATCH',
      `/identity/drivers/${params.data.id}`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  // The invite-codes admin screen's "Generate code" action (2026-09-27) — core decides who's
  // allowed to (the admin gate lives in identity/interface/routes.ts), this route knows nothing
  // about that, same "validate, authenticate, forward, relay unchanged" shape as every other
  // route here. No body to validate — a code is generated, never chosen by the caller.
  app.post('/identity/invite-codes', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('POST', '/identity/invite-codes', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/identity/invite-codes', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('GET', '/identity/invite-codes', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
