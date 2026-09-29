import {
  createFleetVehicleRequestSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  createFleetVehicle,
  type CreateFleetVehicleDeps,
} from '../application/create-fleet-vehicle.js';
import {
  deleteFleetVehicle,
  type DeleteFleetVehicleDeps,
} from '../application/delete-fleet-vehicle.js';
import {
  listFleetVehicles,
  type ListFleetVehiclesDeps,
} from '../application/list-fleet-vehicles.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import {
  updateFleetVehicle,
  type UpdateFleetVehicleDeps,
} from '../application/update-fleet-vehicle.js';
import type { FleetVehicle } from '../domain/vehicle.js';
import { statusFor } from './error-mapping.js';

export interface FleetRouteDeps {
  readonly createFleetVehicle: CreateFleetVehicleDeps;
  readonly updateFleetVehicle: UpdateFleetVehicleDeps;
  readonly deleteFleetVehicle: DeleteFleetVehicleDeps;
  readonly listFleetVehicles: ListFleetVehiclesDeps;
  /** Resolves who's calling, for the use cases' own permission checks
   *  (`application/authorization.ts`) and for the request's RLS scope. */
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (P2-M1.7, migration 0021). */
  readonly dataScopes: DataScopes;
}

function vehicleDto(vehicle: FleetVehicle) {
  return {
    id: vehicle.id,
    companyId: vehicle.companyId,
    name: vehicle.name,
    dimensions: vehicle.dimensions,
  };
}

/** The signed-in staff member, from `host/staff-auth.ts` (P2-M1.12c: fleet moved from driver
 *  tokens to staff tokens). 401 if there isn't one. */
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

/** WagonWise admins see every company's fleet; a company's staff only their own company's. */
function scopeFor(caller: Caller): DataScope {
  return caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };
}

/**
 * Fleet vehicles are company-scoped business data (Phase 2 tech design doc §3/§4): nobody sees
 * another company's fleet. Every route resolves the signed-in staff member via `callerDirectory`
 * (P2-M1.12c; `companies` owns staff accounts, AGENTS.md rule 7); `requireStaffId` (401) always
 * runs first. The permission checks themselves
 * (403, or 404 for a vehicle in a company the caller can't see) are the use cases' own
 * (P2-M1.8, `application/authorization.ts`).
 *
 * P2-M1.7: the vehicle reads and writes run inside the caller's `DataScopes` scope, so Postgres
 * Row-Level Security enforces the same company boundary a second time.
 */
export function registerFleetRoutes(app: FastifyInstance, deps: FleetRouteDeps): void {
  /** The caller, and the scope their fleet work runs in, or the 403 to send instead. */
  async function callerAndScope(
    staffId: Id<'StaffId'>,
  ): Promise<{ caller: Caller; scope: DataScope } | undefined> {
    const caller = await deps.callerDirectory.getCaller(staffId);
    return caller ? { caller, scope: scopeFor(caller) } : undefined;
  }

  app.get('/staff/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await listFleetVehicles(deps.listFleetVehicles, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: { vehicles: result.value.map(vehicleDto) } };
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    const body = createFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await createFleetVehicle(deps.createFleetVehicle, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
        name: body.data.name,
        dimensions: body.data.dimensions,
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 201, body: vehicleDto(result.value) };
    });
    return send(request, reply, outcome);
  });

  app.put('/staff/fleet/vehicles/:id', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    const body = updateFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await updateFleetVehicle(deps.updateFleetVehicle, {
        caller: who.caller,
        id: makeId<'FleetVehicleId'>(params.data.id),
        name: body.data.name,
        dimensions: body.data.dimensions,
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: vehicleDto(result.value) };
    });
    return send(request, reply, outcome);
  });

  app.delete('/staff/fleet/vehicles/:id', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await deleteFleetVehicle(deps.deleteFleetVehicle, {
        caller: who.caller,
        id: makeId<'FleetVehicleId'>(params.data.id),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 204 };
    });
    return send(request, reply, outcome);
  });
}
