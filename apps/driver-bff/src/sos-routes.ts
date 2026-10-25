import { cancelSosRequestSchema, raiseSosRequestSchema } from '@wagonwise/contracts/sos';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface SosRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `what3words-routes.ts`: validate, authenticate, forward with the original token, relay unchanged (AGENTS.md rule 10).
 *  Core decides which companies are told and emails their office. */
export function registerSosRoutes(app: FastifyInstance, deps: SosRouteDeps): void {
  app.post('/sos/raise', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = raiseSosRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/sos/raise', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/sos/cancel', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = cancelSosRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/sos/cancel', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
