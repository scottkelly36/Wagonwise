import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenVerifier } from './access-token-verifier.js';

const BEARER_PREFIX = 'Bearer ';

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
}

/**
 * "Verify twice" (design doc §9): fails fast locally, before ever calling core, then hands back
 * the original token unchanged for the caller to forward — core does its own authoritative
 * re-verification and derives `driverId`/`reporterId` from it itself, never from anything the BFF
 * supplies (decision 1). Sends a 401 and returns `undefined` on failure; the route only needs to
 * check for that and return.
 *
 * Shared by routing's and hazards' route files (M4.4), which only need the raw token to forward,
 * not its claims. `identity-routes.ts` keeps its own inline copy of this same shape for
 * `sessions/:id/revoke`, which also needs the parsed session id to check against the URL — a
 * genuinely different job, not worth forcing through this narrower helper.
 */
export async function authenticateOrReject(
  request: FastifyRequest,
  reply: FastifyReply,
  verifier: AccessTokenVerifier,
): Promise<string | undefined> {
  const token = bearerToken(request.headers.authorization);
  if (token === undefined) {
    await reply.status(401).send({ error: 'missing_bearer_token', requestId: request.id });
    return undefined;
  }
  try {
    await verifier.verify(token);
  } catch {
    await reply.status(401).send({ error: 'invalid_access_token', requestId: request.id });
    return undefined;
  }
  return token;
}
