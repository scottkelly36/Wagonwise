import {
  feedbackIdParamsSchema,
  listFeedbackQuerySchema,
  setFeedbackResolvedRequestSchema,
  submitFeedbackRequestSchema,
} from '@wagonwise/contracts/feedback';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import {
  listFeedback,
  setFeedbackResolved,
  type CallerDirectory,
  type ReviewFeedbackDeps,
} from '../application/review-feedback.js';
import { submitFeedback, type SubmitFeedbackDeps } from '../application/submit-feedback.js';
import { statusFor } from './error-mapping.js';

export interface FeedbackRouteDeps {
  readonly submitFeedback: SubmitFeedbackDeps;
  readonly review: ReviewFeedbackDeps;
  readonly callerDirectory: CallerDirectory;
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

  // WagonWise staff read what drivers sent and mark it resolved. Platform staff only, checked here and again in the use case.
  async function staffCaller(request: FastifyRequest, reply: FastifyReply) {
    if (request.staffId === undefined) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      void reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return caller;
  }

  app.get('/staff/feedback', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const query = listFeedbackQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await listFeedback(deps.review, caller, query.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      counts: result.value.counts,
      notes: result.value.notes.map(({ note, from }) => ({
        id: note.id,
        message: note.message,
        appVersion: note.appVersion,
        deviceInfo: note.deviceInfo,
        createdAt: note.createdAt.toISOString(),
        ...(note.resolvedAt === undefined ? {} : { resolvedAt: note.resolvedAt.toISOString() }),
        ...(from === undefined ? {} : { from }),
      })),
    });
  });

  app.put('/staff/feedback/:id/resolved', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const params = feedbackIdParamsSchema.safeParse(request.params);
    const body = setFeedbackResolvedRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await setFeedbackResolved(
      deps.review,
      caller,
      makeId<'FeedbackNoteId'>(params.data.id),
      body.data.resolved,
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });
}
