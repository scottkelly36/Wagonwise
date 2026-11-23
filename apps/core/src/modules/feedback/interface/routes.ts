import {
  RESEARCH_CONTACT_WORDING,
  feedbackIdParamsSchema,
  listFeedbackQuerySchema,
  setFeedbackResolvedRequestSchema,
  setResearchContactRequestSchema,
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
import {
  getMyResearchContact,
  listResearchContacts,
  setMyResearchContact,
  type ResearchContactDeps,
} from '../application/research-contact.js';
import { submitFeedback, type SubmitFeedbackDeps } from '../application/submit-feedback.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import { statusFor } from './error-mapping.js';

export interface FeedbackRouteDeps {
  readonly submitFeedback: SubmitFeedbackDeps;
  readonly review: ReviewFeedbackDeps;
  readonly callerDirectory: CallerDirectory;
  readonly research: ResearchContactDeps;
  readonly dataScopes: DataScopes;
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

  // Market research contact (docs/company-account-states-scope.md): a person at a company may say WagonWise can ask them for feedback.
  // Their own answer is read and written in their company's scope; WagonWise staff read the list of people who said yes.
  const wording = RESEARCH_CONTACT_WORDING;
  const researchBody = (mine: { available: boolean; agreed: boolean | null; at: Date | null }) => ({
    available: mine.available,
    agreed: mine.agreed,
    at: mine.at?.toISOString() ?? null,
    version: wording.version,
    text: wording.text,
    note: wording.note,
  });
  async function fleetScope(request: FastifyRequest, reply: FastifyReply) {
    if (request.staffId === undefined) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    if (caller.kind !== 'fleet') {
      void reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    const scope: DataScope = { kind: 'company', companyId: caller.companyId };
    return { staffId: request.staffId, caller, scope };
  }

  app.get('/staff/research-contact', async (request, reply) => {
    const who = await fleetScope(request, reply);
    if (who === undefined) return reply;
    const result = await deps.dataScopes.run(who.scope, () =>
      getMyResearchContact(deps.research, who.caller, who.staffId),
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(researchBody(result.value));
  });

  app.put('/staff/research-contact', async (request, reply) => {
    const who = await fleetScope(request, reply);
    if (who === undefined) return reply;
    const body = setResearchContactRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deps.dataScopes.run(who.scope, () =>
      setMyResearchContact(deps.research, who.caller, who.staffId, body.data),
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(researchBody(result.value));
  });

  app.get('/staff/research-contacts', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const result = await listResearchContacts(deps.research, caller, (work) =>
      deps.dataScopes.run({ kind: 'platform' }, work),
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      available: result.value.available,
      version: wording.version,
      people: result.value.people.map((p) => ({ ...p, at: p.at.toISOString() })),
    });
  });
}
