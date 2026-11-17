import { flowEventsRequestSchema } from '@wagonwise/contracts/usage';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface UsageRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * The anonymous flow events (docs/flow-tracking-plan.md). Same shape as the other forwarders: authenticate, check the shape, forward,
 * relay unchanged (AGENTS.md rule 10). The check against the contract's fixed lists happens here too, so a batch with anything off
 * the lists never reaches core.
 */
export function registerUsageRoutes(app: FastifyInstance, deps: UsageRouteDeps): void {
  app.post('/usage/flow-events', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = flowEventsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/usage/flow-events', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
