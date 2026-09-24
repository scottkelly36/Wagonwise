import type { FastifyInstance } from 'fastify';
import type { AccessTokenVerifier } from './access-token-verifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    driverId?: string;
    sessionId?: string;
  }
}

const BEARER_PREFIX = 'Bearer ';

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
}

/**
 * "Verify twice" (design doc §9): the BFF already verified this token once, remotely, to fail
 * fast; this is the authoritative check, and from here on the only place `driverId` legitimately
 * enters a gated request — never a body or query field a caller supplied (decision 1, closing the
 * gap M2.2/M3.4 flagged).
 *
 * `prefixes` is explicit, not hardcoded to `/routing`/`/hazards`, so each module's routes come
 * under this gate only once its own interface layer actually reads `request.driverId` instead of
 * a trusted field — routing first (M4.2), hazards once M4.3 does the same for `reporterId`.
 * Unlike `internal-auth.ts`'s global hook, this is never applied to identity's own pre-token
 * routes (`otp/request`, `otp/verify`, `token/refresh`, its JWKS route), which run before any
 * access token exists, or to `/health`.
 *
 * Error tags (`missing_bearer_token`, `invalid_access_token`) match the BFF's own
 * `identity-routes.ts` exactly — the same failure has the same name on both sides of the wire.
 */
export function registerDriverAuth(
  app: FastifyInstance,
  verifier: AccessTokenVerifier,
  prefixes: readonly string[],
): void {
  app.decorateRequest('driverId', undefined);
  app.decorateRequest('sessionId', undefined);

  app.addHook('onRequest', async (request, reply) => {
    // A prefix ending in `/` (every entry here) must also match the bare path with that trailing
    // slash stripped — `request.url.startsWith('/identity/devices/')` alone is false for the real
    // route's own URL, `/identity/devices`, which has no trailing slash to start with. Found by
    // actually driving `POST /identity/devices` end to end (M6.5) rather than only through
    // `build-app.test.ts`'s own `/identity/devices/protected` fixture, which always had the extra
    // path segment this bug needed to hide behind.
    const matches = prefixes.some(
      (prefix) => request.url === prefix.slice(0, -1) || request.url.startsWith(prefix),
    );
    if (!matches) {
      return;
    }

    const token = bearerToken(request.headers.authorization);
    if (token === undefined) {
      await reply.status(401).send({ error: 'missing_bearer_token', requestId: request.id });
      return;
    }

    try {
      const claims = await verifier.verify(token);
      request.driverId = claims.driverId;
      request.sessionId = claims.sessionId;
    } catch {
      await reply.status(401).send({ error: 'invalid_access_token', requestId: request.id });
    }
  });
}
