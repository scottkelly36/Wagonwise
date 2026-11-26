import {
  sendMyTachographFileRequestSchema,
  tachographCompanyParamsSchema,
} from '@wagonwise/contracts/tachograph';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface TachographRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `hours-routes.ts`: validate, authenticate, forward with the original token, relay unchanged (AGENTS.md rule 10).
 *  Core decides everything: whether the firm takes files, and that a driver sends only their own card file. */
export function registerTachographRoutes(app: FastifyInstance, deps: TachographRouteDeps): void {
  app.get('/tachograph/mine', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/tachograph/mine', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/tachograph/companies/:companyId/files', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const params = tachographCompanyParamsSchema.safeParse(request.params);
    const body = sendMyTachographFileRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/tachograph/companies/${encodeURIComponent(params.data.companyId)}/files`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });
}
