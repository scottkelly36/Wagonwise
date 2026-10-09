import {
  hoursCompanyParamsSchema,
  hoursSettingsSchema,
  reportHoursStatusRequestSchema,
  setHoursSharingRequestSchema,
} from '@wagonwise/contracts/hours';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  clearMyStatus,
  getFirmSetting,
  listMySharing,
  listStatuses,
  reportStatus,
  setFirmSetting,
  setMySharing,
  type CompanyNotFound,
  type FirmNotEnabled,
  type Forbidden,
  type HoursDeps,
  type NotOnAJob,
  type NotSharing,
} from '../application/hours.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  StaffCaller,
} from '../application/ports.js';
import type { InvalidStatus } from '../domain/hours.js';

export interface HoursRouteDeps {
  readonly hours: HoursDeps;
  readonly callerDirectory: CallerDirectory;
  readonly driverIdentities: DriverIdentityDirectory;
  readonly dataScopes: DataScopes;
}

type HoursError =
  Forbidden | CompanyNotFound | FirmNotEnabled | NotOnAJob | NotSharing | InvalidStatus;

function statusFor(error: HoursError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'CompanyNotFound':
      return 404;
    case 'FirmNotEnabled':
    case 'NotOnAJob':
    case 'NotSharing':
      return 409;
    case 'InvalidStatus':
      return 400;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: HoursError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

/**
 * Driver hours sharing. The office's side: the firm's switch, and the statuses of drivers who share. The driver's side:
 * their own choice per company, and sending their latest status. Nothing is stored or shown unless the firm and the
 * driver have both switched it on (`application/hours.ts`), and Row-Level Security (migration 0054) keeps one company's
 * rows from another's and a driver to their own.
 */
export function registerHoursRoutes(app: FastifyInstance, deps: HoursRouteDeps): void {
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: StaffCaller, staffId: string) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const staffId = request.staffId;
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(staffId));
    const outcome =
      caller === null
        ? { status: 403, body: { tag: 'Forbidden' } }
        : await deps.dataScopes.run(scopeFor(caller), () => work(caller, staffId));
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  async function asDriver(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (driverId: ReturnType<typeof makeId<'DriverId'>>, identifier: string) => Promise<Outcome>,
  ) {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const driverId = makeId<'DriverId'>(request.driverId);
    const identifier = await deps.driverIdentities.getIdentifier(driverId);
    if (identifier === null) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const outcome = await deps.dataScopes.run({ kind: 'driver', driverId, identifier }, () =>
      work(driverId, identifier),
    );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  // --- the office ---------------------------------------------------------------------------------------------------

  app.get('/staff/hours/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = hoursCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getFirmSetting(
        deps.hours,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok ? { status: 200, body: { enabled: result.value } } : failure(result.error);
    }),
  );

  app.put('/staff/hours/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = hoursCompanyParamsSchema.safeParse(request.params);
      const body = hoursSettingsSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setFirmSetting(
        deps.hours,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data.enabled,
      );
      return result.ok ? { status: 200, body: { enabled: result.value } } : failure(result.error);
    }),
  );

  app.get('/staff/hours/companies/:companyId/status', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = hoursCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listStatuses(
        deps.hours,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              statuses: result.value.map((s) => ({
                driverId: s.driverId,
                state: s.state,
                drivingLeftMin: s.drivingLeftMin,
                next: s.next,
                ...(s.breakMin === undefined ? {} : { breakMin: s.breakMin }),
                ...(s.stretchMin === undefined ? {} : { stretchMin: s.stretchMin }),
                ...(s.untilLimitMin === undefined ? {} : { untilLimitMin: s.untilLimitMin }),
                updatedAt: s.updatedAt.toISOString(),
              })),
            },
          }
        : failure(result.error);
    }),
  );

  // --- the driver ---------------------------------------------------------------------------------------------------

  app.get('/hours/sharing', (request, reply) =>
    asDriver(request, reply, async (driverId, identifier) => {
      const rows = await listMySharing(deps.hours, driverId, identifier);
      return { status: 200, body: { companies: rows } };
    }),
  );

  app.put('/hours/sharing/:companyId', (request, reply) =>
    asDriver(request, reply, async (driverId, identifier) => {
      const params = hoursCompanyParamsSchema.safeParse(request.params);
      const body = setHoursSharingRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setMySharing(
        deps.hours,
        driverId,
        identifier,
        makeId<'CompanyId'>(params.data.companyId),
        body.data.sharing,
        body.data.wordingVersion,
      );
      return result.ok ? { status: 200, body: { sharing: result.value } } : failure(result.error);
    }),
  );

  app.put('/hours/status', (request, reply) =>
    asDriver(request, reply, async (driverId) => {
      const body = reportHoursStatusRequestSchema.safeParse(request.body);
      if (!body.success) return INVALID;
      const result = await reportStatus(deps.hours, driverId, body.data);
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.delete('/hours/status', (request, reply) =>
    asDriver(request, reply, async (driverId) => {
      await clearMyStatus(deps.hours, driverId);
      return { status: 204 };
    }),
  );
}
