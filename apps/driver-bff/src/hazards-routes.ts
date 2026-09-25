import {
  findNearbyHazardsRequestSchema,
  hazardReportIdParamsSchema,
  parseVoiceHazardReportRequestSchema,
  reportHazardRequestSchema,
} from '@wagonwise/contracts/hazards';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface HazardsRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * Same shape as `routing-routes.ts`: validate, authenticate, forward, relay unchanged (AGENTS.md
 * rule 10). `reportHazardRequestSchema` carries no `reporterId` field (M4.3) — the reporter is
 * whoever the token says. Confirm/dismiss still authenticate even though core doesn't use the
 * identity for anything (decision 63 — no ownership check), matching core's own driver-auth hook,
 * which gates the whole `/hazards/` prefix regardless of whether a given handler reads the claim.
 */
export function registerHazardsRoutes(app: FastifyInstance, deps: HazardsRouteDeps): void {
  app.post('/hazards/reports', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = reportHazardRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/hazards/reports', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/hazards/reports/nearby', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = findNearbyHazardsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/hazards/reports/nearby', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/hazards/voice-reports/parse', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = parseVoiceHazardReportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/hazards/voice-reports/parse', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/hazards/reports/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'GET',
      `/hazards/reports/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/hazards/reports/:id/confirm', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/hazards/reports/${params.data.id}/confirm`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/hazards/reports/:id/dismiss', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/hazards/reports/${params.data.id}/dismiss`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });
}
