import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { registerErrorHandling } from './error-handler.js';
import { registerHealthRoute } from './health-route.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Builds the Fastify host: request IDs, CORS for the dashboard, error shaping, health. Thin by
 * design (AGENTS.md rule 10: "BFFs contain no business rules"); the staff routes are registered
 * in main.ts once their dependencies (the JWKS client, the core HTTP client) are built.
 */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', (request, reply, _payload, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  // Only the dashboard's origin, never `*`: this BFF carries staff access tokens.
  void app.register(cors, {
    origin: config.dashboardOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  registerErrorHandling(app);
  registerHealthRoute(app);

  return app;
}
