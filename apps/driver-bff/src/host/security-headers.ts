import type { FastifyInstance } from 'fastify';

/**
 * Headers every response carries. This server only ever answers JSON to the driver app, so a
 * browser has no reason to render, frame, sniff or send a referrer for anything it returns. They
 * cost nothing and close off the cases where someone points a browser at it anyway.
 *
 * Strict-Transport-Security is sent only in production: over plain http (local dev) browsers ignore
 * it, and a header that does nothing there is just noise.
 */
export function registerSecurityHeaders(
  app: FastifyInstance,
  options: { readonly production: boolean },
): void {
  app.addHook('onSend', (_request, reply, _payload, done) => {
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('x-frame-options', 'DENY');
    void reply.header('referrer-policy', 'no-referrer');
    void reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    if (options.production) {
      void reply.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
    }
    done();
  });
}
