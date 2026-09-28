import {
  createFleetVehicleRequestSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface FleetRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `companies-routes.ts`/`identity-routes.ts`: validate, authenticate, forward,
 *  relay unchanged (AGENTS.md rule 10). Core decides who's allowed to (the admin/Fleet-user
 *  scope check lives in fleet/interface/routes.ts) — this route knows nothing about that. */
export function registerFleetRoutes(app: FastifyInstance, deps: FleetRouteDeps): void {
  app.get('/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'GET',
      `/fleet/companies/${params.data.companyId}/vehicles`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    const body = createFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/fleet/companies/${params.data.companyId}/vehicles`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.put('/fleet/vehicles/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    const body = updateFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'PUT',
      `/fleet/vehicles/${params.data.id}`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.delete('/fleet/vehicles/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'DELETE',
      `/fleet/vehicles/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });
}
