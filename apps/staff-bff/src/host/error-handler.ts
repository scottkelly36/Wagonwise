import type { FastifyError, FastifyInstance } from 'fastify';

/**
 * Matches core's own host/error-handler.ts: a 5xx never leaks its message (it can contain a URL,
 * a stack frame, internals of whatever failed), the request ID in the body is what a tester
 * quotes back so the real error can be found in the logs.
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
