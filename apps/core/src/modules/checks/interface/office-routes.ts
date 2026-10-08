import {
  checkResultParamsSchema,
  checkResultPhotoParamsSchema,
  checkResultsQuerySchema,
  checksCompanyParamsSchema,
  defectIdParamsSchema,
  defectsQuerySchema,
  setDefectStatusRequestSchema,
} from '@wagonwise/contracts/checks';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  getCheckPhoto,
  getCheckResult,
  listCheckResults,
  listCompanyDefects,
  setDefectStatus,
  type Forbidden,
  type InvalidRange,
  type NotFound,
  type OfficeCheckDeps,
} from '../application/office-checks.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  StaffCaller,
} from '../application/ports/directories.js';
import type { DriverId } from '../domain/check.js';
import type { CheckDetail, CheckSummary, DefectRecord } from '../domain/office.js';

export interface ChecksOfficeRouteDeps {
  readonly office: OfficeCheckDeps;
  readonly callerDirectory: CallerDirectory;
  /** The driver's sign-in (phone or email), the only name the portal has for a driver. */
  readonly drivers: DriverIdentityDirectory;
  readonly dataScopes: DataScopes;
}

type OfficeError = Forbidden | NotFound | InvalidRange;

function statusFor(error: OfficeError): number {
  switch (error.tag) {
    case 'InvalidRange':
      return 400;
    case 'Forbidden':
      return 403;
    case 'NotFound':
      return 404;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: OfficeError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

function defectDto(d: DefectRecord) {
  return {
    id: d.id,
    checkId: d.checkId,
    vehicleId: d.vehicleId,
    vehicleName: d.vehicleName,
    itemId: d.itemId,
    label: d.label,
    severity: d.severity,
    detail: d.detail,
    ...(d.note === undefined ? {} : { note: d.note }),
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    ...(d.statusChangedAt === undefined
      ? {}
      : { statusChangedAt: d.statusChangedAt.toISOString() }),
  };
}

/**
 * The office's door onto walk-round checks (the staff dashboard): the checks drivers have done, one in full with its
 * photos, and the defects they found, which fleet managers and dispatchers work through. Every use case checks the
 * caller's own permission, and Row-Level Security (migration 0044) refuses another company's rows.
 */
export function registerChecksOfficeRoutes(
  app: FastifyInstance,
  deps: ChecksOfficeRouteDeps,
): void {
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

  const driverLabels = async (summaries: readonly { driverId: DriverId }[]) => {
    const labels = new Map<string, string>();
    for (const id of new Set(summaries.map((s) => s.driverId))) {
      const label = await deps.drivers.getIdentifier(id);
      if (label !== null) labels.set(id, label);
    }
    return labels;
  };
  const summaryDto = (c: CheckSummary, labels: ReadonlyMap<string, string>) => ({
    id: c.id,
    templateName: c.templateName,
    vehicleId: c.vehicleId,
    vehicleName: c.vehicleName,
    ...(labels.has(c.driverId) ? { driverLabel: labels.get(c.driverId) } : {}),
    checkDay: c.checkDay,
    submittedAt: c.submittedAt.toISOString(),
    result: c.result,
    defectCount: c.defectCount,
  });
  const detailDto = (c: CheckDetail, labels: ReadonlyMap<string, string>) => ({
    ...summaryDto({ ...c, defectCount: c.defects.length }, labels),
    templateVersion: c.templateVersion,
    ...(c.deviceCompletedAt === undefined
      ? {}
      : { deviceCompletedAt: c.deviceCompletedAt.toISOString() }),
    items: c.items,
    answers: c.answers,
    defects: c.defects.map(defectDto),
    photoItemIds: c.photoItemIds,
  });

  app.get('/staff/checks/companies/:companyId/results', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      const query = checkResultsQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return INVALID;
      const result = await listCheckResults(
        deps.office,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        query.data,
      );
      if (!result.ok) return failure(result.error);
      const labels = await driverLabels(result.value);
      return {
        status: 200,
        body: { checks: result.value.map((c) => summaryDto(c, labels)) },
      };
    }),
  );

  app.get('/staff/checks/results/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checkResultParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getCheckResult(deps.office, caller, makeId<'CheckId'>(params.data.id));
      if (!result.ok) return failure(result.error);
      return { status: 200, body: detailDto(result.value, await driverLabels([result.value])) };
    }),
  );

  app.get('/staff/checks/results/:id/photos/:itemId', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checkResultPhotoParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getCheckPhoto(
        deps.office,
        caller,
        makeId<'CheckId'>(params.data.id),
        params.data.itemId,
      );
      return result.ok
        ? {
            status: 200,
            body: {
              contentType: result.value.contentType,
              dataBase64: result.value.dataBase64,
              capturedAt: result.value.capturedAt.toISOString(),
            },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/checks/companies/:companyId/defects', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      const query = defectsQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return INVALID;
      const result = await listCompanyDefects(
        deps.office,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        query.data.status,
      );
      return result.ok
        ? { status: 200, body: { defects: result.value.map(defectDto) } }
        : failure(result.error);
    }),
  );

  app.put('/staff/checks/defects/:id/status', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = defectIdParamsSchema.safeParse(request.params);
      const body = setDefectStatusRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setDefectStatus(
        deps.office,
        caller,
        makeId<'StaffId'>(staffId),
        params.data.id,
        body.data.status,
      );
      return result.ok ? { status: 200, body: defectDto(result.value) } : failure(result.error);
    }),
  );
}
