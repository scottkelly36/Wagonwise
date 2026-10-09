import {
  advanceJobStatusRequestSchema,
  assignJobRequestSchema,
  createJobRequestSchema,
  failJobRequestSchema,
  jobCompanyIdParamsSchema,
  jobIdParamsSchema,
  jobReportRequestSchema,
  previewJobRouteRequestSchema,
  proofOfDeliveryQuerySchema,
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
import { listNotices, resendNotice, type NoticeDeps } from '../application/job-notices.js';
import { createJob, type CreateJobDeps } from '../application/create-job.js';
import {
  getProofOfDelivery,
  type GetProofOfDeliveryDeps,
} from '../application/get-proof-of-delivery.js';
import { previewJobRoute, type PreviewJobRouteDeps } from '../application/preview-job-route.js';
import { reportJobs, type ReportJobsDeps } from '../application/report-jobs.js';
import { listJobEtas, type ListJobEtasDeps } from '../application/list-job-etas.js';
import { listJobPositions, type ListJobPositionsDeps } from '../application/list-job-positions.js';
import { getJob, listJobs, type GetJobDeps, type ListJobsDeps } from '../application/list-jobs.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import type { JobStop } from '../domain/job.js';
import { jobDto, jobReportDto, noticeDto } from './dto.js';
import { statusFor } from './error-mapping.js';

export interface JobsRouteDeps {
  readonly createJob: CreateJobDeps;
  readonly assignJob: AssignJobDeps;
  readonly changeStatus: ChangeJobStatusDeps;
  readonly listJobs: ListJobsDeps;
  readonly getJob: GetJobDeps;
  readonly getProofOfDelivery: GetProofOfDeliveryDeps;
  readonly listPositions: ListJobPositionsDeps;
  readonly listEtas: ListJobEtasDeps;
  readonly notices: NoticeDeps & { readonly repo: GetJobDeps['repo'] };
  readonly previewRoute: PreviewJobRouteDeps;
  readonly report: ReportJobsDeps;
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
        ...(body.data.requiresProofOfDelivery === undefined
          ? {}
          : { requiresProofOfDelivery: body.data.requiresProofOfDelivery }),
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

  // P2-M8: the jobs report. Needs `view_reports` (a step beyond viewing jobs), checked in the use case.
  app.post('/staff/jobs/companies/:companyId/report', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      const body = jobReportRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const from = new Date(body.data.from);
      const to = new Date(body.data.to);
      if (from.getTime() >= to.getTime()) return INVALID;
      const result = await reportJobs(deps.report, {
        caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
        from,
        to,
      });
      return result.ok ? { status: 200, body: jobReportDto(result.value) } : failure(result.error);
    }),
  );

  app.get('/staff/jobs/companies/:companyId/positions', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listJobPositions(deps.listPositions, {
        caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      return result.ok
        ? {
            status: 200,
            body: {
              positions: result.value.map((p) => ({
                jobId: p.jobId,
                location: p.location,
                recordedAt: p.recordedAt.toISOString(),
              })),
            },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/jobs/companies/:companyId/etas', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listJobEtas(deps.listEtas, {
        caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      return result.ok
        ? {
            status: 200,
            body: {
              etas: result.value.map((eta) => ({
                jobId: eta.jobId,
                stopKind: eta.stopKind,
                distanceKm: eta.distanceKm,
                durationMin: eta.durationMin,
                geometry: eta.geometry,
                fromRecordedAt: eta.fromRecordedAt.toISOString(),
              })),
            },
          }
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

  app.get('/staff/jobs/:id/proof-of-delivery', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const query = proofOfDeliveryQuerySchema.safeParse(request.query);
      if (!query.success) return INVALID;
      const result = await getProofOfDelivery(deps.getProofOfDelivery, {
        caller,
        jobId: makeId<'JobId'>(params.data.id),
        stop: query.data.stop,
      });
      return result.ok
        ? {
            status: 200,
            body: {
              contentType: result.value.contentType,
              dataBase64: result.value.data.toString('base64'),
              capturedAt: result.value.capturedAt.toISOString(),
            },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/jobs/companies/:companyId/notices', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobCompanyIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listNotices(
        deps.notices,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { notices: result.value.map(noticeDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/resend-notice', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await resendNotice(deps.notices, caller, makeId<'JobId'>(params.data.id));
      return result.ok ? { status: 200, body: noticeDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/jobs/:id/route-preview', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = previewJobRouteRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await previewJobRoute(deps.previewRoute, {
        caller,
        jobId: makeId<'JobId'>(params.data.id),
        vehicleId: makeId<'FleetVehicleId'>(body.data.vehicleId),
      });
      return result.ok ? { status: 200, body: result.value } : failure(result.error);
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
