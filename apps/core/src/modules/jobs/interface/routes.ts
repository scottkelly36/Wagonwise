import {
  advanceJobStatusRequestSchema,
  assignJobRequestSchema,
  createJobRequestSchema,
  failJobRequestSchema,
  jobCompanyIdParamsSchema,
  jobIdParamsSchema,
} from '@wagonwise/contracts/jobs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import { assignJob, type AssignJobDeps } from '../application/assign-job.js';
import {
  advanceJobStatus,
  cancelJob,
  failJob,
  type ChangeJobStatusDeps,
} from '../application/change-job-status.js';
import { createJob, type CreateJobDeps } from '../application/create-job.js';
import { getJob, listJobs, type GetJobDeps, type ListJobsDeps } from '../application/list-jobs.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import type { JobStop } from '../domain/job.js';
import { jobDto } from './dto.js';
import { statusFor } from './error-mapping.js';

export interface JobsRouteDeps {
  readonly createJob: CreateJobDeps;
  readonly assignJob: AssignJobDeps;
  readonly changeStatus: ChangeJobStatusDeps;
  readonly listJobs: ListJobsDeps;
  readonly getJob: GetJobDeps;
  /** Resolves who's calling, for the use cases' own permission checks
   *  (`application/authorization.ts`) and for the request's RLS scope. */
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (P2-M1.7, migration 0021). */
  readonly dataScopes: DataScopes;
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

function failure(error: Parameters<typeof statusFor>[0]): Outcome {
  return { status: statusFor(error), body: error };
}

/**
 * Staff-side job routes (design doc §5): create, list, get, assign, cancel, and (for a dispatcher
 * stepping a job on their driver's behalf) advance and fail. The driver's own endpoints arrive
 * with the driver app (M5). Every route: `requireStaffId` (401) first, then the use case's own
 * permission checks (403/404, `application/authorization.ts`), all inside the caller's
 * `DataScopes` scope so Postgres Row-Level Security enforces the company boundary a second time
 * (P2-M1.7).
 */
export function registerJobsRoutes(app: FastifyInstance, deps: JobsRouteDeps): void {
  /** Signs the request in, resolves the caller, and runs `work` in their RLS scope. */
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: Caller) => Promise<Outcome>,
  ) {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;
    const caller = await deps.callerDirectory.getCaller(staffId);
    if (!caller) return send(request, reply, FORBIDDEN);
    const outcome = await deps.dataScopes.run(scopeFor(caller), () => work(caller));
    return send(request, reply, outcome);
  }

  app.post('/staff/jobs/companies/:companyId/jobs', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      const body = createJobRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
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
      return result.ok ? { status: 201, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.get('/staff/jobs/companies/:companyId/jobs', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listJobs(deps.listJobs, {
        caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      return result.ok
        ? { status: 200, body: { jobs: result.value.map(jobDto) } }
        : failure(result.error);
    }),
  );

  app.get('/staff/jobs/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getJob(deps.getJob, { caller, jobId: makeId<'JobId'>(params.data.id) });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/assign', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = assignJobRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await assignJob(deps.assignJob, {
        caller,
        jobId: makeId<'JobId'>(params.data.id),
        driverId: makeId<'DriverId'>(body.data.driverId),
        vehicleId: makeId<'FleetVehicleId'>(body.data.vehicleId),
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/status', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = advanceJobStatusRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await advanceJobStatus(deps.changeStatus, {
        actor: caller,
        jobId: makeId<'JobId'>(params.data.id),
        to: body.data.status,
        position: body.data.position,
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/cancel', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await cancelJob(deps.changeStatus, {
        actor: caller,
        jobId: makeId<'JobId'>(params.data.id),
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/fail', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = failJobRequestSchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) return INVALID;
      const result = await failJob(deps.changeStatus, {
        actor: caller,
        jobId: makeId<'JobId'>(params.data.id),
        position: body.data.position,
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );
}
