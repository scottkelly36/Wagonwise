import { warningsAtRequestSchema } from '@wagonwise/contracts/weather';
import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './auth/access-token-verifier.js';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreClient } from './core-client.js';

export interface WeatherRouteDeps {
  readonly coreClient: CoreClient;
  readonly accessTokenVerifier: AccessTokenVerifier;
}

/** Same shape as `places-routes.ts`: validate, authenticate, forward with the original token, relay
 *  unchanged (AGENTS.md rule 10). The Met Office key never leaves core. */
export function registerWeatherRoutes(app: FastifyInstance, deps: WeatherRouteDeps): void {
  app.post('/weather/warnings/at', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.accessTokenVerifier);
    if (token === undefined) return reply;
    const parsed = warningsAtRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const core = await deps.coreClient.request('POST', '/weather/warnings/at', request.id, {
      body: parsed.data,
      authorization: `Bearer ${token}`,
    });
    return reply.status(core.status).send(core.body);
  });
}
