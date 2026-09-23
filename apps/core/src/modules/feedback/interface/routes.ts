import { submitFeedbackRequestSchema } from '@wagonwise/contracts/feedback';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { submitFeedback, type SubmitFeedbackDeps } from '../application/submit-feedback.js';
import { statusFor } from './error-mapping.js';

export interface FeedbackRouteDeps {
  readonly submitFeedback: SubmitFeedbackDeps;
}

/**
 * `driverId` never comes from a body or query field a caller supplied — `request.driverId` is
 * set by `host/driver-auth.ts`'s hook, which must run before this handler (wired in
 * `compose-core.ts`, matching routing/hazards' own `requireDriverId`, duplicated rather than
 * shared per AGENTS.md rule 6).
 */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

export function registerFeedbackRoutes(app: FastifyInstance, deps: FeedbackRouteDeps): void {
  app.post('/feedback/notes', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const parsed = submitFeedbackRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await submitFeedback(deps.submitFeedback, {
      driverId,
      message: parsed.data.message,
      appVersion: parsed.data.appVersion,
      deviceInfo: parsed.data.deviceInfo,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });
}
