import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Clock } from '../shared/ports/clock.js';
import type { IdGenerator } from '../shared/ports/id-generator.js';
import { registerErrorHandling } from './error-handler.js';
import { registerHealthRoute } from './health-route.js';
import { registerInternalAuth } from './internal-auth.js';

export interface AppDeps {
  readonly config: Config;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Builds the Fastify host. Knows nothing about bounded contexts: modules register their own
 * routes through the composition root, so this stays a thin shell.
 */
export function buildApp({ config, clock, ids }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Honour an ID sent by the BFF so one request can be followed across services.
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: () => ids.newId(),
  });

  app.addHook('onSend', (request, reply, _payload, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  registerErrorHandling(app);
  registerInternalAuth(app, config.internalKeys);
  registerHealthRoute(app, { clock });

  return app;
}
