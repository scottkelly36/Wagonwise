import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { registerErrorHandling } from './error-handler.js';
import { registerHealthRoute } from './health-route.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Builds the Fastify host. Thin by design (AGENTS.md rule 10: "BFFs contain no business rules")
 * — request ID plumbing, error shaping, health. Route registration (identity forwarding) is
 * wired separately, in main.ts, once its own dependencies (the JWKS client, the core HTTP
 * client) are built.
 */
export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: REQUEST_ID_HEADER,
    // No app-level IdGenerator port here — the BFF has no entities to identify, just requests to
    // trace, so a single direct crypto.randomUUID() call is proportionate (unlike core, which
    // needs the port for actual domain IDs across many use cases).
    genReqId: () => randomUUID(),
    // Matches core's own bump (host/build-app.ts): a proof-of-delivery photo (P2-M5.5) passes
    // through this BFF on its way to core, so it needs the same headroom over Fastify's 1 MiB
    // default.
    bodyLimit: 10 * 1024 * 1024,
  });

  app.addHook('onSend', (request, reply, _payload, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  // No CORS: since P2-M1.12c the dashboard talks only to the staff BFF, and the driver app is a
  // mobile app. No browser page has any business calling this one.

  registerErrorHandling(app);
  registerHealthRoute(app);

  return app;
}
