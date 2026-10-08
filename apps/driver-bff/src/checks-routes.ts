import {
  attachCheckPhotoRequestSchema,
  checkPhotoParamsSchema,
  submitCheckRequestSchema,
} from '@wagonwise/contracts/checks';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface ChecksRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `places-routes.ts`: validate, authenticate, forward with the original token, relay unchanged
 *  (AGENTS.md rule 10). Core decides everything: which vehicle the driver is on, which lists apply, and what a
 *  check's answers mean. */
export function registerChecksRoutes(app: FastifyInstance, deps: ChecksRouteDeps): void {
  app.get('/checks/mine', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/checks/mine', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/checks', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = submitCheckRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/checks', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.put('/checks/:id/photos/:itemId', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const params = checkPhotoParamsSchema.safeParse(request.params);
    const body = attachCheckPhotoRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'PUT',
      `/checks/${params.data.id}/photos/${params.data.itemId}`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });
}
