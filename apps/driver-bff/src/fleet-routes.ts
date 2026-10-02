import {
  driverLinkIdParamsSchema,
  joinWithCodeRequestSchema,
  respondToInvitationRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface FleetRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** The driver's side of joining a company (P2-M2.5): see my invitations and companies, join with a
 *  company's code, answer an invitation, leave. Same shape as every other proxied route: validate,
 *  authenticate, forward with the driver's own token, relay unchanged (AGENTS.md rule 10). Core
 *  decides who the driver is, what they can see, and the code-guessing limit. */
export function registerFleetRoutes(app: FastifyInstance, deps: FleetRouteDeps): void {
  const forward = async (
    request: FastifyRequest,
    reply: FastifyReply,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request(method, path, request.id, {
      ...(body === undefined ? {} : { body }),
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  };

  app.get('/fleet/links', (request, reply) => forward(request, reply, 'GET', '/fleet/links'));

  app.post('/fleet/links/join', (request, reply) => {
    const parsed = joinWithCodeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(request, reply, 'POST', '/fleet/links/join', parsed.data);
  });

  app.post('/fleet/links/:id/respond', (request, reply) => {
    const params = driverLinkIdParamsSchema.safeParse(request.params);
    const parsed = respondToInvitationRequestSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(request, reply, 'POST', `/fleet/links/${params.data.id}/respond`, parsed.data);
  });

  app.post('/fleet/links/:id/leave', (request, reply) => {
    const params = driverLinkIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(request, reply, 'POST', `/fleet/links/${params.data.id}/leave`);
  });
}
