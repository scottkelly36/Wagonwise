import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import type { Clock } from '../shared/ports/clock.js';
import type { IdGenerator } from '../shared/ports/id-generator.js';
import type { AccessTokenVerifier, StaffAccessTokenVerifier } from './access-token-verifier.js';
import { registerDriverAuth } from './driver-auth.js';
import { registerErrorHandling } from './error-handler.js';
import { registerHealthRoute } from './health-route.js';
import { registerInternalAuth } from './internal-auth.js';
import { registerStaffAuth } from './staff-auth.js';

export interface AppDeps {
  readonly config: Config;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly accessTokenVerifier: AccessTokenVerifier;
  /** Staff (dashboard) tokens, for `/staff/` (P2-M1.6). Separate from drivers': each side
   *  refuses the other's tokens. */
  readonly staffAccessTokenVerifier: StaffAccessTokenVerifier;
}

// Routing gated as of M4.2, hazards as of M4.3, feedback as of M5.9 — each reads
// `request.driverId` instead of a trusted body field. `/identity/devices/` specifically, not all
// of `/identity/` (M6.2) — identity's other routes are the pre-token sign-in flow itself
// (OTP request/verify, token refresh, JWKS) and can't require an access token they don't have
// yet.
const DRIVER_AUTH_PREFIXES = [
  '/routing/',
  '/hazards/',
  '/feedback/',
  '/congestion/',
  '/parking/',
  '/places/',
  '/checks/',
  '/weather/',
  '/fleet/',
  '/jobs/',
  '/identity/devices/',
  '/identity/consent/',
  '/identity/account/',
];

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Builds the Fastify host. Knows nothing about bounded contexts: modules register their own
 * routes through the composition root, so this stays a thin shell.
 */
export function buildApp({
  config,
  clock,
  ids,
  accessTokenVerifier,
  staffAccessTokenVerifier,
}: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Honour an ID sent by the BFF so one request can be followed across services.
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: () => ids.newId(),
    // Fastify's own default (1 MiB) is too small for a proof-of-delivery photo (P2-M5.5):
    // base64-over-JSON, capped at 7MB of base64 by the contract schema, plus a little JSON
    // overhead. Every other route's body is tiny, so this is generous for them, not risky.
    bodyLimit: 10 * 1024 * 1024,
  });

  app.addHook('onSend', (request, reply, _payload, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  registerErrorHandling(app);
  registerInternalAuth(app, config.internalKeys);
  registerDriverAuth(app, accessTokenVerifier, DRIVER_AUTH_PREFIXES);
  registerStaffAuth(app, staffAccessTokenVerifier);
  registerHealthRoute(app, { clock });

  return app;
}
