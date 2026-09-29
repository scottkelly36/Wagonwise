import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffTokenVerifier } from './staff-token-verifier.js';

const BEARER_PREFIX = 'Bearer ';

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;
}

/**
 * "Verify twice" (design doc §9): refuse a missing or bad staff token here, before calling core,
 * then hand back the original token for the route to forward. Core re-verifies it and loads the
 * account itself; nothing the BFF decodes is ever passed on as a claim. Sends the 401 and returns
 * `undefined` on failure.
 */
export async function authenticateOrReject(
  request: FastifyRequest,
  reply: FastifyReply,
  verifier: StaffTokenVerifier,
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
