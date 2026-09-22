import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const HEADER = 'x-internal-key';

/**
 * Core is not publicly exposed (design doc §2); this is the second line of defence — every
 * request must present one of the currently-valid keys in `X-Internal-Key` (decision 11). Two
 * (or more) keys can be valid at once so a key rotates without downtime: add the new key here
 * alongside the old one, point the BFF at the new one, then remove the old one.
 *
 * `/health` is exempt — it is what an orchestrator or a human polls to check the process is
 * alive, leaks nothing, and the README's cold-start `curl` step relies on it needing no header.
 *
 * One Fastify hook, registered once in `buildApp` (design doc §9: "because verification sits in
 * one Fastify plugin, upgrading later is a single file").
 */
export function registerInternalAuth(app: FastifyInstance, validKeys: readonly string[]): void {
  app.addHook('onRequest', (request, reply, done) => {
    if (request.url === '/health') {
      done();
      return;
    }
    const presented = request.headers[HEADER];
    if (
      typeof presented !== 'string' ||
      !validKeys.some((key) => constantTimeEquals(presented, key))
    ) {
      reply.status(401).send({ error: 'invalid_internal_key', requestId: request.id });
      return;
    }
    done();
  });
}

/**
 * `timingSafeEqual` throws on mismatched lengths rather than returning false, and the length of
 * a valid key is not itself a secret worth protecting at constant time — check it first, compare
 * the bytes at constant time only once the lengths already match.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
