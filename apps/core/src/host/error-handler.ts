import type { FastifyError, FastifyInstance } from 'fastify';

/**
 * Bugs and infrastructure faults throw and land here (AGENTS.md rule 13). Expected failures are
 * `Result` values and never reach this handler.
 *
 * A 5xx never leaks the message: it can contain SQL, file paths or internals. The request ID in
 * the body is what a tester quotes back so the real error can be found in the logs.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send({ error: 'internal_error', requestId: request.id });
    }
    return reply
      .status(status)
      .send({ error: error.code, message: error.message, requestId: request.id });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: 'not_found', requestId: request.id }),
  );
}
