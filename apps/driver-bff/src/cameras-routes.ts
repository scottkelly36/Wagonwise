import { findNearbyCamerasRequestSchema } from '@wagonwise/contracts/cameras';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface CamerasRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `parking-routes.ts`: validate, authenticate, forward, relay unchanged (AGENTS.md rule 10). */
export function registerCamerasRoutes(app: FastifyInstance, deps: CamerasRouteDeps): void {
  app.post('/cameras/nearby', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = findNearbyCamerasRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/cameras/nearby', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
