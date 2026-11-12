import { announcementPreferenceSchema } from '@wagonwise/contracts/announcements';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface AnnouncementsRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/**
 * Same shape as the other forwarders: authenticate, forward, relay unchanged (AGENTS.md rule 10). The newest note from WagonWise, for "What's new", and the
 * driver's choice about notifications from WagonWise.
 */
export function registerAnnouncementsRoutes(
  app: FastifyInstance,
  deps: AnnouncementsRouteDeps,
): void {
  app.get('/announcements/latest', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/announcements/latest', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.get('/announcements/preference', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const core = await deps.coreClient.request('GET', '/announcements/preference', request.id, {
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });

  app.put('/announcements/preference', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = announcementPreferenceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('PUT', '/announcements/preference', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
