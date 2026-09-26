import {
  findNearbyCongestionRequestSchema,
  reportCongestionRequestSchema,
} from '@wagonwise/contracts/congestion';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface CongestionRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `hazards-routes.ts`/`routing-routes.ts`: validate, authenticate, forward, relay
 *  unchanged (AGENTS.md rule 10). `reportCongestionRequestSchema` carries no `reporterId` field —
 *  the reporter is whoever the token says, same as hazards. */
export function registerCongestionRoutes(app: FastifyInstance, deps: CongestionRouteDeps): void {
  app.post('/congestion/reports', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = reportCongestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/congestion/reports', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/congestion/reports/nearby', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = findNearbyCongestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/congestion/reports/nearby', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
