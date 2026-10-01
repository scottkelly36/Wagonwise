import { createJobRequestSchema, jobCompanyIdParamsSchema } from '@wagonwise/contracts/jobs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import { createJob, type CreateJobDeps } from '../application/create-job.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import type { Job, JobStop } from '../domain/job.js';
import { statusFor } from './error-mapping.js';

export interface JobsRouteDeps {
  readonly createJob: CreateJobDeps;
  /** Resolves who's calling, for the use case's own permission check
   *  (`application/authorization.ts`) and for the request's RLS scope. */
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (P2-M1.7, migration 0021). */
  readonly dataScopes: DataScopes;
}

function stopDto(stop: JobStop) {
  return {
    kind: stop.kind,
    name: stop.name,
    location: stop.location,
    ...(stop.windowFrom === undefined ? {} : { windowFrom: stop.windowFrom.toISOString() }),
    ...(stop.windowTo === undefined ? {} : { windowTo: stop.windowTo.toISOString() }),
    ...(stop.notes === undefined ? {} : { notes: stop.notes }),
  };
}

function jobDto(job: Job) {
  return {
    id: job.id,
    companyId: job.companyId,
    reference: job.reference,
    stops: job.stops.map(stopDto),
    status: job.status,
    timeline: job.timeline.map((entry) => ({
      status: entry.status,
      at: entry.at.toISOString(),
      ...(entry.position === undefined ? {} : { position: entry.position }),
    })),
    ...(job.plannedStart === undefined ? {} : { plannedStart: job.plannedStart.toISOString() }),
    ...(job.dueBy === undefined ? {} : { dueBy: job.dueBy.toISOString() }),
  };
}

/** The signed-in staff member, from `host/staff-auth.ts`. 401 if there isn't one — same pattern
 *  as fleet's own `requireStaffId`. */
function requireStaffId(request: FastifyRequest, reply: FastifyReply): Id<'StaffId'> | undefined {
  if (request.staffId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'StaffId'>(request.staffId);
}

/** What a handler decided, sent only after its scope's transaction has committed. */
interface Outcome {
  readonly status: number;
  readonly body?: object;
}

function send(request: FastifyRequest, reply: FastifyReply, outcome: Outcome) {
  if (outcome.body === undefined) return reply.status(outcome.status).send();
  const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
  return reply.status(outcome.status).send(body);
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const FORBIDDEN: Outcome = { status: 403, body: { tag: 'Forbidden' } };

/** WagonWise admins act for every company; a company's staff only their own. */
function scopeFor(caller: Caller): DataScope {
  return caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };
}

/**
 * This slice is just "create a job" (design doc §5 step 1) — no list, get, assign or status
 * change yet (docs/progress.md). Same shape as fleet's own routes: `requireStaffId` (401) first,
 * the use case's own permission check (403, `application/authorization.ts`), then the request
 * runs inside the caller's `DataScopes` scope so Postgres Row-Level Security enforces the same
 * company boundary a second time (P2-M1.7).
 */
export function registerJobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): void {
  app.post('/staff/jobs/companies/:companyId/jobs', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = jobCompanyIdParamsSchema.safeParse(request.params);
    const body = createJobRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);

    const caller = await deps.callerDirectory.getCaller(staffId);
    if (!caller) return send(request, reply, FORBIDDEN);
    const scope = scopeFor(caller);

    const outcome = await deps.dataScopes.run(scope, async (): Promise<Outcome> => {
      const result = await createJob(deps.createJob, {
        caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
        reference: body.data.reference,
        stops: body.data.stops.map((s): JobStop => ({
          kind: s.kind,
          name: s.name,
          location: s.location,
          ...(s.windowFrom === undefined ? {} : { windowFrom: new Date(s.windowFrom) }),
          ...(s.windowTo === undefined ? {} : { windowTo: new Date(s.windowTo) }),
          ...(s.notes === undefined ? {} : { notes: s.notes }),
        })),
        ...(body.data.plannedStart === undefined
          ? {}
          : { plannedStart: new Date(body.data.plannedStart) }),
        ...(body.data.dueBy === undefined ? {} : { dueBy: new Date(body.data.dueBy) }),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 201, body: jobDto(result.value) };
    });
    return send(request, reply, outcome);
  });
}
