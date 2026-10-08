import {
  attachCheckPhotoRequestSchema,
  checkPhotoParamsSchema,
  submitCheckRequestSchema,
} from '@wagonwise/contracts/checks';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  attachCheckPhoto,
  checksDue,
  submitCheck,
  type CheckNotFound,
  type DriverCheckDeps,
  type Forbidden,
  type NoPhotoWanted,
  type SubmitCheckError,
} from '../application/driver-checks.js';
import type { DriverIdentityDirectory } from '../application/ports/directories.js';
import type { Check, DriverId } from '../domain/check.js';
import { templateDto } from './dto.js';

export interface ChecksDriverRouteDeps {
  readonly checks: DriverCheckDeps;
  readonly identities: DriverIdentityDirectory;
  /** Row-Level Security scope per request (migration 0044). */
  readonly dataScopes: DataScopes;
}

type DriverCheckError = SubmitCheckError | CheckNotFound | NoPhotoWanted | Forbidden;

function statusFor(error: DriverCheckError): number {
  switch (error.tag) {
    case 'InvalidAnswers':
    case 'VehicleNotInCompany':
    case 'TemplateNotForVehicle':
    case 'NoPhotoWanted':
      return 400;
    case 'Forbidden':
      return 403;
    case 'TemplateNotFound':
    case 'CheckNotFound':
      return 404;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: DriverCheckError): Outcome => ({
  status: statusFor(error),
  body: error,
});

function submittedDto(check: Check) {
  return {
    id: check.id,
    result: check.result,
    defects: check.defects.map((d) => ({
      itemId: d.itemId,
      label: d.label,
      severity: d.severity,
      detail: d.detail,
    })),
  };
}

/**
 * The driver's door onto walk-round checks: what is due on the vehicle for their current job, filing a completed
 * check, and a photo for a question. Every use case checks the driver's own right, and Row-Level Security
 * (migration 0044) stops a driver reaching another company's lists or a colleague's photos.
 */
export function registerChecksDriverRoutes(
  app: FastifyInstance,
  deps: ChecksDriverRouteDeps,
): void {
  async function asDriver(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (driverId: DriverId) => Promise<Outcome>,
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
      work(driverId),
    );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/checks/mine', (request, reply) =>
    asDriver(request, reply, async (driverId) => {
      const due = await checksDue(deps.checks, driverId);
      return {
        status: 200,
        body: {
          vehicle: due.vehicle,
          lists: due.lists.map((l) => ({
            template: templateDto(l.template),
            doneToday: l.doneToday,
          })),
        },
      };
    }),
  );

  app.post('/checks', (request, reply) =>
    asDriver(request, reply, async (driverId) => {
      const body = submitCheckRequestSchema.safeParse(request.body);
      if (!body.success) return INVALID;
      const result = await submitCheck(deps.checks, driverId, {
        id: makeId<'CheckId'>(body.data.id),
        templateId: makeId<'CheckTemplateId'>(body.data.templateId),
        vehicleId: makeId<'FleetVehicleId'>(body.data.vehicleId),
        answers: body.data.answers,
        completedAt:
          body.data.completedAt === undefined ? undefined : new Date(body.data.completedAt),
      });
      return result.ok ? { status: 201, body: submittedDto(result.value) } : failure(result.error);
    }),
  );

  app.put('/checks/:id/photos/:itemId', (request, reply) =>
    asDriver(request, reply, async (driverId) => {
      const params = checkPhotoParamsSchema.safeParse(request.params);
      const body = attachCheckPhotoRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await attachCheckPhoto(
        deps.checks,
        driverId,
        makeId<'CheckId'>(params.data.id),
        params.data.itemId,
        body.data,
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
