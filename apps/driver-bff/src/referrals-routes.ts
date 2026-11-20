import { claimRewardRequestSchema, referralIdParamsSchema } from '@wagonwise/contracts/referrals';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface ReferralsRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * Same shape as the other forwarders: authenticate, check the shape, forward, relay unchanged (AGENTS.md rule 10). The driver's own
 * referral code and referrals, and claiming a reward that is due.
 */
export function registerReferralsRoutes(app: FastifyInstance, deps: ReferralsRouteDeps): void {
  app.get('/referrals/me', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/referrals/me', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.post('/referrals/:id/claim', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const params = referralIdParamsSchema.safeParse(request.params);
    const body = claimRewardRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request(
      'POST',
      `/referrals/${params.data.id}/claim`,
      request.id,
      { body: body.data, authorization: `Bearer ${token}` },
    );
    return reply.status(core.status).send(core.body);
  });
}
