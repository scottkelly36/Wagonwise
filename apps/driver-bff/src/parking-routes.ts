import {
  findNearbySafeParkingSpotsRequestSchema,
  reportSafeParkingSpotRequestSchema,
  safeParkingSpotIdParamsSchema,
} from '@wagonwise/contracts/parking';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface ParkingRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `congestion-routes.ts`/`hazards-routes.ts`: validate, authenticate, forward,
 *  relay unchanged (AGENTS.md rule 10). `reportSafeParkingSpotRequestSchema` carries no
 *  `reporterId` field — the reporter is whoever the token says, same as congestion. */
export function registerParkingRoutes(app: FastifyInstance, deps: ParkingRouteDeps): void {
  app.post('/parking/spots', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = reportSafeParkingSpotRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/parking/spots', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.delete('/parking/spots/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = safeParkingSpotIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'DELETE',
      `/parking/spots/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/parking/spots/nearby', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = findNearbySafeParkingSpotsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/parking/spots/nearby', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
