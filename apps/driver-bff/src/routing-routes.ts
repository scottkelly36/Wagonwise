import {
  activeTripIdParamsSchema,
  createVehicleProfileRequestSchema,
  planRouteRequestSchema,
  routePlanIdParamsSchema,
  updateVehicleProfileRequestSchema,
  vehicleProfileIdParamsSchema,
} from '@wagonwise/contracts/routing';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface RoutingRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * Auth verification, request shaping, forwarding — nothing else (AGENTS.md rule 10). Every route
 * validates against the same `@wagonwise/contracts` schemas core does (none of them carry a
 * `driverId` field any more, per M4.2 — the driver is whoever the token says), then relays core's
 * status and body back unchanged. `authenticateOrReject` fails fast locally before ever calling
 * core; the original token is forwarded unchanged so core can do its own authoritative
 * verification and derive `driverId` itself (decision 1, "verify twice").
 */
export function registerRoutingRoutes(app: FastifyInstance, deps: RoutingRouteDeps): void {
  app.post('/routing/vehicle-profiles', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = createVehicleProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/routing/vehicle-profiles', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/routing/vehicle-profiles', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('GET', '/routing/vehicle-profiles', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/routing/vehicle-profiles/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'GET',
      `/routing/vehicle-profiles/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.put('/routing/vehicle-profiles/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    const body = updateVehicleProfileRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'PUT',
      `/routing/vehicle-profiles/${params.data.id}`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.delete('/routing/vehicle-profiles/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'DELETE',
      `/routing/vehicle-profiles/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/routing/route-plans', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = planRouteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/routing/route-plans', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/routing/route-plans/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'GET',
      `/routing/route-plans/${params.data.id}`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/routing/route-plans/:id/trip', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/routing/route-plans/${params.data.id}/trip`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.post('/routing/trips/:id/end', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const params = activeTripIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/routing/trips/${params.data.id}/end`,
      request.id,
      { authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.get('/routing/trips/active', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('GET', '/routing/trips/active', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
