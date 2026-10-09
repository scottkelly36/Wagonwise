import {
  hoursCompanyParamsSchema,
  reportHoursStatusRequestSchema,
  setHoursSharingRequestSchema,
} from '@wagonwise/contracts/hours';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface HoursRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `checks-routes.ts`: validate, authenticate, forward with the original token, relay unchanged (AGENTS.md
 *  rule 10). Core decides everything: which company a status goes to, and whether both switches are on. */
export function registerHoursRoutes(app: FastifyInstance, deps: HoursRouteDeps): void {
  app.get('/hours/sharing', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/hours/sharing', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.put('/hours/sharing/:companyId', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const params = hoursCompanyParamsSchema.safeParse(request.params);
    const body = setHoursSharingRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'PUT',
      `/hours/sharing/${encodeURIComponent(params.data.companyId)}`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });

  app.put('/hours/status', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const body = reportHoursStatusRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('PUT', '/hours/status', request.id, {
      body: body.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.delete('/hours/status', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('DELETE', '/hours/status', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
