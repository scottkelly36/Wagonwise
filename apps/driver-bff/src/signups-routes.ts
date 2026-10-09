import { removeSignupRequestSchema, signupRequestSchema } from '@wagonwise/contracts/signups';
import type { FastifyInstance } from 'fastify';
import type { CoreClient } from './core-client.js';

export interface SignupsRouteDeps {
  readonly coreClient: CoreClient;
}

/**
 * The landing page's "register to test" and "remove my email". Public on purpose: they are for people with no account, and
 * the page posts to them on its own address (the landing page's host routes `/signups` here), so no cross-site access is
 * opened on this server. They only validate the shape and forward; core decides everything, and answers the same whether or
 * not an address was already there (AGENTS.md rule 10).
 */
export function registerSignupsRoutes(app: FastifyInstance, deps: SignupsRouteDeps): void {
  app.post('/signups', async (request, reply) => {
    const parsed = signupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/signups', request.id, {
      body: parsed.data,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/signups/remove', async (request, reply) => {
    const parsed = removeSignupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/signups/remove', request.id, {
      body: parsed.data,
    });
    return reply.status(core.status).send(core.body);
  });
}
