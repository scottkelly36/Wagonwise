import { submitFeedbackRequestSchema } from '@wagonwise/contracts/feedback';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface FeedbackRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * Same shape as `routing-routes.ts`/`hazards-routes.ts`: validate, authenticate, forward, relay
 * unchanged (AGENTS.md rule 10). `submitFeedbackRequestSchema` carries no `driverId` field — the
 * sender is whoever the token says.
 */
export function registerFeedbackRoutes(app: FastifyInstance, deps: FeedbackRouteDeps): void {
  app.post('/feedback/notes', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = submitFeedbackRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/feedback/notes', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
