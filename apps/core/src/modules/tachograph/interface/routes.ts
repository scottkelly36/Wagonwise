import {
  sendMyTachographFileRequestSchema,
  tachographCompanyParamsSchema,
  tachographFileParamsSchema,
  tachographSettingsSchema,
  uploadTachographFileRequestSchema,
} from '@wagonwise/contracts/tachograph';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  StaffCaller,
} from '../application/ports.js';
import {
  deleteFile,
  downloadFile,
  getFirmSettings,
  listFiles,
  listMine,
  sendMyFile,
  setFirmSettings,
  uploadFile,
  type CompanyNotFound,
  type FileNotFound,
  type FirmNotEnabled,
  type Forbidden,
  type SubjectNotFound,
  type TachographDeps,
} from '../application/tachograph.js';
import type { FileSummary, InvalidFile } from '../domain/tachograph.js';

export interface TachographRouteDeps {
  readonly tachograph: TachographDeps;
  readonly callerDirectory: CallerDirectory;
  readonly driverIdentities: DriverIdentityDirectory;
  readonly dataScopes: DataScopes;
}

type TachographError =
  Forbidden | CompanyNotFound | FirmNotEnabled | SubjectNotFound | FileNotFound | InvalidFile;

function statusFor(error: TachographError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'CompanyNotFound':
    case 'SubjectNotFound':
    case 'FileNotFound':
      return 404;
    case 'FirmNotEnabled':
      return 409;
    case 'InvalidFile':
      return 400;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: TachographError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

const row = (f: FileSummary) => ({
  id: f.id,
  kind: f.kind,
  ...(f.driverId === undefined ? {} : { driverId: f.driverId }),
  ...(f.vehicleId === undefined ? {} : { vehicleId: f.vehicleId }),
  fileName: f.fileName,
  sizeBytes: f.sizeBytes,
  downloadedOn: f.downloadedOn,
  receivedAt: f.receivedAt.toISOString(),
  source: f.source,
});

/**
 * Tachograph files. The office's side: the firm's choices, uploading a file, the tracker's data, getting a file back exactly as it
 * was received, deleting one. The driver's side: sending their own card file to a firm that has switched that on. Row-Level Security
 * (migration 0109) keeps one company's files from another's and a driver to their own.
 */
export function registerTachographRoutes(app: FastifyInstance, deps: TachographRouteDeps): void {
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

  app.get('/staff/tachograph/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = tachographCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getFirmSettings(
        deps.tachograph,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok ? { status: 200, body: result.value } : failure(result.error);
    }),
  );

  app.put('/staff/tachograph/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = tachographCompanyParamsSchema.safeParse(request.params);
      const body = tachographSettingsSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setFirmSettings(
        deps.tachograph,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data,
      );
      return result.ok ? { status: 200, body: result.value } : failure(result.error);
    }),
  );

  app.get('/staff/tachograph/companies/:companyId/files', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = tachographCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listFiles(
        deps.tachograph,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? {
            status: 200,
            body: { latest: result.value.latest.map(row), recent: result.value.recent.map(row) },
          }
        : failure(result.error);
    }),
  );

  app.post('/staff/tachograph/companies/:companyId/files', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = tachographCompanyParamsSchema.safeParse(request.params);
      const body = uploadTachographFileRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await uploadFile(
        deps.tachograph,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data,
      );
      return result.ok
        ? { status: result.value.duplicate ? 200 : 201, body: result.value }
        : failure(result.error);
    }),
  );

  app.get('/staff/tachograph/companies/:companyId/files/:fileId', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = tachographFileParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await downloadFile(
        deps.tachograph,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        params.data.fileId,
      );
      return result.ok
        ? {
            status: 200,
            body: {
              fileName: result.value.fileName,
              dataBase64: result.value.data.toString('base64'),
              sha256: result.value.sha256,
            },
          }
        : failure(result.error);
    }),
  );

  app.delete('/staff/tachograph/companies/:companyId/files/:fileId', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = tachographFileParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await deleteFile(
        deps.tachograph,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        params.data.fileId,
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  // --- the driver ---------------------------------------------------------------------------------------------------

  app.get('/tachograph/mine', (request, reply) =>
    asDriver(request, reply, async (driverId, identifier) => {
      const rows = await listMine(deps.tachograph, driverId, identifier);
      return {
        status: 200,
        body: {
          companies: rows.map((r) => ({
            companyId: r.companyId,
            companyName: r.companyName,
            firmEnabled: r.firmEnabled,
            ...(r.lastDownloadedOn === undefined ? {} : { lastDownloadedOn: r.lastDownloadedOn }),
          })),
        },
      };
    }),
  );

  app.post('/tachograph/companies/:companyId/files', (request, reply) =>
    asDriver(request, reply, async (driverId, identifier) => {
      const params = tachographCompanyParamsSchema.safeParse(request.params);
      const body = sendMyTachographFileRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await sendMyFile(
        deps.tachograph,
        driverId,
        identifier,
        makeId<'CompanyId'>(params.data.companyId),
        body.data,
      );
      return result.ok
        ? { status: result.value.duplicate ? 200 : 201, body: result.value }
        : failure(result.error);
    }),
  );
}
