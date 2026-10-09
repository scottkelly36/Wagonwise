import {
  assignFuelVehicleRequestSchema,
  costingCompanyParamsSchema,
  fuelIdParamsSchema,
  fuelQuerySchema,
  importFuelRequestSchema,
} from '@wagonwise/contracts/costing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  assignVehicle,
  importFuel,
  listFuel,
  listImports,
  listUnmatched,
  rematchFuel,
  undoImport,
  type Forbidden,
  type FuelDeps,
  type NoRows,
  type NotFound,
  type TooManyRows,
  type VehicleNotFound,
} from '../application/fuel.js';
import type { CallerDirectory, StaffCaller } from '../application/ports.js';
import type { FuelTransaction } from '../domain/fuel.js';

export interface CostingRouteDeps {
  readonly fuel: FuelDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

type CostingError = Forbidden | NotFound | TooManyRows | NoRows | VehicleNotFound;

function statusFor(error: CostingError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'NotFound':
    case 'VehicleNotFound':
      return 404;
    case 'TooManyRows':
    case 'NoRows':
      return 400;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: CostingError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

const transactionDto = (t: FuelTransaction & { readonly vehicleName?: string | undefined }) => ({
  id: t.id,
  occurredAt: t.occurredAt.toISOString(),
  registration: t.registration,
  ...(t.vehicleId === undefined ? {} : { vehicleId: t.vehicleId }),
  ...(t.vehicleName === undefined ? {} : { vehicleName: t.vehicleName }),
  ...(t.litres === undefined ? {} : { litres: t.litres }),
  amountPence: t.amountPence,
  ...(t.description === undefined ? {} : { description: t.description }),
});

/**
 * Fuel for the dashboard: import a card statement, see fuel by vehicle, match what did not match, and undo an import.
 * Every use case checks the caller's own permission, and Row-Level Security (migration 0056) refuses another company's
 * rows.
 */
export function registerCostingRoutes(app: FastifyInstance, deps: CostingRouteDeps): void {
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

  app.post('/staff/costing/companies/:companyId/fuel/import', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      const body = importFuelRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await importFuel(
        deps.fuel,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data.fileName,
        body.data.rows,
      );
      return result.ok
        ? {
            status: 200,
            body: {
              ...(result.value.importId === undefined ? {} : { importId: result.value.importId }),
              imported: result.value.imported,
              duplicates: result.value.duplicates,
              invalid: result.value.invalid,
              matched: result.value.matched,
              unmatched: result.value.unmatched,
              unmatchedRegistrations: result.value.unmatchedRegistrations,
            },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/costing/companies/:companyId/fuel', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      const query = fuelQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return INVALID;
      const result = await listFuel(
        deps.fuel,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        new Date(query.data.from),
        new Date(query.data.to),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              transactions: result.value.transactions.map(transactionDto),
              byVehicle: result.value.byVehicle.map((l) => ({
                ...(l.vehicleId === undefined ? {} : { vehicleId: l.vehicleId }),
                ...(l.vehicleName === undefined ? {} : { vehicleName: l.vehicleName }),
                ...(l.registration === undefined ? {} : { registration: l.registration }),
                purchases: l.purchases,
                litres: l.litres,
                amountPence: l.amountPence,
                ...(l.pencePerLitre === undefined ? {} : { pencePerLitre: l.pencePerLitre }),
              })),
              totalPence: result.value.totalPence,
              totalLitres: result.value.totalLitres,
              unmatchedCount: result.value.unmatchedCount,
            },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/costing/companies/:companyId/fuel/unmatched', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listUnmatched(
        deps.fuel,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { transactions: result.value.map(transactionDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/costing/companies/:companyId/fuel/rematch', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await rematchFuel(
        deps.fuel,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok ? { status: 200, body: { matched: result.value } } : failure(result.error);
    }),
  );

  app.get('/staff/costing/companies/:companyId/fuel/imports', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listImports(
        deps.fuel,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              imports: result.value.map((i) => ({
                id: i.id,
                fileName: i.fileName,
                importedAt: i.importedAt.toISOString(),
                rowsTotal: i.rowsTotal,
                rowsImported: i.rowsImported,
                rowsDuplicate: i.rowsDuplicate,
              })),
            },
          }
        : failure(result.error);
    }),
  );

  app.post('/staff/costing/fuel/:id/vehicle', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      const body = assignFuelVehicleRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await assignVehicle(
        deps.fuel,
        caller,
        makeId<'FuelTransactionId'>(params.data.id),
        body.data.vehicleId === null ? undefined : makeId<'FleetVehicleId'>(body.data.vehicleId),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.delete('/staff/costing/fuel/imports/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await undoImport(deps.fuel, caller, makeId<'FuelImportId'>(params.data.id));
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
