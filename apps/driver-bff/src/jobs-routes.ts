import {
  advanceJobStatusRequestSchema,
  attachProofOfDeliveryRequestSchema,
  failJobRequestSchema,
  jobIdParamsSchema,
} from '@wagonwise/contracts/jobs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface JobsRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** The driver's side of a job (P2-M5.1): see the one job they're on, move it forward a step, or
 *  report it failed. Same shape as every other proxied route: validate, authenticate, forward
 *  with the driver's own token, relay core unchanged (AGENTS.md rule 10). Core decides who the
 *  driver is and what they can do to the job. */
export function registerJobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): void {
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

  app.get('/jobs/current', (request, reply) => forward(request, reply, 'GET', '/jobs/current'));

  app.post('/jobs/:id/status', (request, reply) => {
    const params = jobIdParamsSchema.safeParse(request.params);
    const parsed = advanceJobStatusRequestSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(request, reply, 'POST', `/jobs/${params.data.id}/status`, parsed.data);
  });

  app.post('/jobs/:id/fail', (request, reply) => {
    const params = jobIdParamsSchema.safeParse(request.params);
    const parsed = failJobRequestSchema.safeParse(request.body ?? {});
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(request, reply, 'POST', `/jobs/${params.data.id}/fail`, parsed.data);
  });

  app.post('/jobs/:id/proof-of-delivery', (request, reply) => {
    const params = jobIdParamsSchema.safeParse(request.params);
    const parsed = attachProofOfDeliveryRequestSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    return forward(
      request,
      reply,
      'POST',
      `/jobs/${params.data.id}/proof-of-delivery`,
      parsed.data,
    );
  });
}
