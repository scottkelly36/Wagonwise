import {
  addRunningCostRequestSchema,
  changeRunningCostRequestSchema,
  costingCompanyParamsSchema,
  fuelIdParamsSchema,
  setDriverRateRequestSchema,
  stopRunningCostRequestSchema,
} from '@wagonwise/contracts/costing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  addRunningCost,
  changeRunningCost,
  deleteDriverRate,
  deleteRunningCost,
  listDriverRates,
  listRunningCosts,
  setDriverRate,
  stopRunningCost,
  type DriverNotFound,
  type Forbidden,
  type InputsDeps,
  type NotFound,
  type VehicleNotFound,
} from '../application/inputs.js';
import type { CallerDirectory, StaffCaller } from '../application/ports.js';
import type {
  InvalidCostChange,
  InvalidRate,
  InvalidRunningCost,
  RunningCost,
} from '../domain/inputs.js';

export interface CostingInputsRouteDeps {
  readonly inputs: InputsDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

type InputsError =
  | Forbidden
  | NotFound
  | VehicleNotFound
  | DriverNotFound
  | InvalidRunningCost
  | InvalidCostChange
  | InvalidRate;

function statusFor(error: InputsError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'NotFound':
    case 'VehicleNotFound':
    case 'DriverNotFound':
      return 404;
    case 'InvalidRunningCost':
    case 'InvalidRate':
      return 400;
    case 'InvalidCostChange':
      return 409;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: InputsError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

const costDto = (c: RunningCost) => ({
  id: c.id,
  ...(c.vehicleId === undefined ? {} : { vehicleId: c.vehicleId }),
  description: c.description,
  monthlyPence: c.monthlyPence,
  fromMonth: c.fromMonth,
  ...(c.toMonth === undefined ? {} : { toMonth: c.toMonth }),
});

/**
 * What a firm tells WagonWise about its costs: running costs (for a vehicle, or for the firm) and what each driver costs an
 * hour. All of it needs `manage_billing` (wages are private), checked in each use case; Row-Level Security (migration 0057)
 * refuses another company's rows.
 */
export function registerCostingInputsRoutes(
  app: FastifyInstance,
  deps: CostingInputsRouteDeps,
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

  app.get('/staff/costing/companies/:companyId/running-costs', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listRunningCosts(
        deps.inputs,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { costs: result.value.map(costDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/costing/companies/:companyId/running-costs', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      const body = addRunningCostRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await addRunningCost(
        deps.inputs,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        {
          ...(body.data.vehicleId == null
            ? {}
            : { vehicleId: makeId<'FleetVehicleId'>(body.data.vehicleId) }),
          description: body.data.description,
          monthlyPence: body.data.monthlyPence,
          fromMonth: body.data.fromMonth,
        },
      );
      return result.ok ? { status: 201, body: costDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/costing/running-costs/:id/change', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      const body = changeRunningCostRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await changeRunningCost(
        deps.inputs,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'RunningCostId'>(params.data.id),
        body.data,
      );
      return result.ok ? { status: 200, body: costDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/costing/running-costs/:id/stop', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      const body = stopRunningCostRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await stopRunningCost(
        deps.inputs,
        caller,
        makeId<'RunningCostId'>(params.data.id),
        body.data.fromMonth,
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.delete('/staff/costing/running-costs/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await deleteRunningCost(
        deps.inputs,
        caller,
        makeId<'RunningCostId'>(params.data.id),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.get('/staff/costing/companies/:companyId/driver-rates', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listDriverRates(
        deps.inputs,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              drivers: result.value.map((d) => ({
                driverId: d.driverId,
                name: d.name,
                rates: d.rates.map((r) => ({
                  id: r.id,
                  hourlyPence: r.hourlyPence,
                  fromDay: r.fromDay,
                })),
              })),
            },
          }
        : failure(result.error);
    }),
  );

  app.put('/staff/costing/companies/:companyId/driver-rates', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      const body = setDriverRateRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setDriverRate(
        deps.inputs,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        {
          driverId: makeId<'DriverId'>(body.data.driverId),
          hourlyPence: body.data.hourlyPence,
          fromDay: body.data.fromDay,
        },
      );
      return result.ok
        ? {
            status: 200,
            body: {
              id: result.value.id,
              hourlyPence: result.value.hourlyPence,
              fromDay: result.value.fromDay,
            },
          }
        : failure(result.error);
    }),
  );

  app.delete('/staff/costing/driver-rates/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = fuelIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await deleteDriverRate(
        deps.inputs,
        caller,
        makeId<'DriverRateId'>(params.data.id),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
