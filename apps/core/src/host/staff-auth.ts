import type { FastifyInstance } from 'fastify';
import type { StaffAccessTokenVerifier } from './access-token-verifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    staffId?: string;
    staffSessionId?: string;
  }
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Every `/staff/` route needs a staff access token, except the ones used before there is one:
 * signing in, the second factor, refreshing, signing out, and accepting an invite. As with
 * drivers, the staff id only ever comes from a verified token, never from the request body.
 * Error tags match `driver-auth.ts`.
 */
export const STAFF_PUBLIC_PATHS: readonly string[] = [
  '/staff/auth/sign-in',
  '/staff/auth/second-factor',
  '/staff/auth/refresh',
  '/staff/auth/sign-out',
  '/staff/invites/accept',
  '/staff/invites/confirm',
];

export function registerStaffAuth(app: FastifyInstance, verifier: StaffAccessTokenVerifier): void {
  app.decorateRequest('staffId', undefined);
  app.decorateRequest('staffSessionId', undefined);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/staff/') && path !== '/staff') return;
    if (STAFF_PUBLIC_PATHS.includes(path)) return;

    const header = request.headers.authorization;
    const token = header?.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length)
      : undefined;
    if (token === undefined) {
      await reply.status(401).send({ error: 'missing_bearer_token', requestId: request.id });
      return;
    }
    try {
      const claims = await verifier.verify(token);
      request.staffId = claims.staffId;
      request.staffSessionId = claims.sessionId;
    } catch {
      await reply.status(401).send({ error: 'invalid_access_token', requestId: request.id });
    }
  });
}
