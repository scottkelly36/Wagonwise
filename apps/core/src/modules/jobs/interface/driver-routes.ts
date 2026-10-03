import {
  advanceJobStatusRequestSchema,
  attachProofOfDeliveryRequestSchema,
  failJobRequestSchema,
  jobIdParamsSchema,
  reportJobPositionRequestSchema,
} from '@wagonwise/contracts/jobs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  attachProofOfDelivery,
  type AttachProofOfDeliveryDeps,
} from '../application/attach-proof-of-delivery.js';
import {
  advanceJobStatus,
  failJob,
  type ChangeJobStatusDeps,
} from '../application/change-job-status.js';
import type { JobActor } from '../application/authorization.js';
import { getCurrentJob, type CurrentJobDeps } from '../application/list-jobs.js';
import {
  recordJobPosition,
  type RecordJobPositionDeps,
} from '../application/record-job-position.js';
import type { DriverIdentityDirectory } from '../application/ports/directories.js';
import { jobDto } from './dto.js';
import { statusFor, type JobsError } from './error-mapping.js';

export interface JobsDriverRouteDeps {
  readonly currentJob: CurrentJobDeps;
  readonly changeStatus: ChangeJobStatusDeps;
  readonly attachProofOfDelivery: AttachProofOfDeliveryDeps;
  readonly recordPosition: RecordJobPositionDeps;
  readonly identities: DriverIdentityDirectory;
  /** Row-Level Security scope per request (migration 0030). */
  readonly dataScopes: DataScopes;
}

type DriverActor = Extract<JobActor, { kind: 'driver' }>;

interface Outcome {
  readonly status: number;
  readonly body?: object;
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };

function failure(error: JobsError): Outcome {
  return { status: statusFor(error), body: error };
}

/**
 * The driver's side of a job (P2-M5.1, design doc §5): see the one job they're on, move it
 * forward a step, or report it failed. Assigning and cancelling stay dispatcher-only
 * (`authorization.ts`'s `canDispatch`) — a driver posting to `/jobs/:id/status`/`/jobs/:id/fail`
 * for a job that isn't theirs gets `Forbidden` from `canAdvance`, backed up by RLS (migration
 * 0030) refusing to even find the row. Reachable only through `driver-bff`, with a verified
 * driver token (`host/build-app.ts`'s `DRIVER_AUTH_PREFIXES`, gated on `/jobs/`).
 */
export function registerJobsDriverRoutes(app: FastifyInstance, deps: JobsDriverRouteDeps): void {
  /** Signs the driver in (401), finds their identifier, and runs `work` in their scope. */
  async function asDriver(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (actor: DriverActor) => Promise<Outcome>,
  ) {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const driverId = makeId<'DriverId'>(request.driverId);
    const identifier = await deps.identities.getIdentifier(driverId);
    if (identifier === null) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const outcome = await deps.dataScopes.run({ kind: 'driver', driverId, identifier }, () =>
      work({ kind: 'driver', driverId }),
    );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/jobs/current', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const job = await getCurrentJob(deps.currentJob, { driverId: actor.driverId });
      return { status: 200, body: { job: job === null ? null : jobDto(job) } };
    }),
  );

  app.post('/jobs/:id/status', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = advanceJobStatusRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await advanceJobStatus(deps.changeStatus, {
        actor,
        jobId: makeId<'JobId'>(params.data.id),
        to: body.data.status,
        position: body.data.position,
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/jobs/:id/fail', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = failJobRequestSchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) return INVALID;
      const result = await failJob(deps.changeStatus, {
        actor,
        jobId: makeId<'JobId'>(params.data.id),
        position: body.data.position,
      });
      return result.ok ? { status: 200, body: jobDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/jobs/:id/proof-of-delivery', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = attachProofOfDeliveryRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await attachProofOfDelivery(deps.attachProofOfDelivery, {
        actor,
        jobId: makeId<'JobId'>(params.data.id),
        photo: {
          contentType: body.data.contentType,
          data: Buffer.from(body.data.dataBase64, 'base64'),
        },
      });
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  // Where the driver is, while they're out on the job (P2-M6.1). 204 on success; 409 `NotTracking`
  // when the job isn't being driven — the app just stops reporting, nothing is stored.
  app.post('/jobs/:id/position', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = jobIdParamsSchema.safeParse(request.params);
      const body = reportJobPositionRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await recordJobPosition(deps.recordPosition, {
        actor,
        jobId: makeId<'JobId'>(params.data.id),
        location: body.data.location,
      });
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
