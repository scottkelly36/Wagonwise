import { createCompanyRequestSchema } from '@wagonwise/contracts/companies';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface CompaniesRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `identity-routes.ts`/`hazards-routes.ts`: validate, authenticate, forward,
 *  relay unchanged (AGENTS.md rule 10). Core decides who's allowed to (the admin gate lives in
 *  companies/interface/routes.ts) — this route knows nothing about that. */
export function registerCompaniesRoutes(app: FastifyInstance, deps: CompaniesRouteDeps): void {
  app.post('/companies', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const parsed = createCompanyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/companies', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/companies', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;

    const core = await deps.coreClient.request('GET', '/companies', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
