import {
  createFleetVehicleRequestSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { canManageFleet, canViewFleet } from '../application/authorization.js';
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
import type { CallerDirectory } from '../application/ports/caller-directory.js';
import type { FleetVehicleRepository } from '../application/ports/fleet-vehicle-repository.js';
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
  readonly vehicleRepo: Pick<FleetVehicleRepository, 'findById'>;
  /** Every fleet route's authorization check needs this — an admin, or a company-scoped driver
   *  with (for mutations) the `manage_fleet` scope (`application/authorization.ts`). */
  readonly callerDirectory: CallerDirectory;
}

function vehicleDto(vehicle: FleetVehicle) {
  return {
    id: vehicle.id,
    companyId: vehicle.companyId,
    name: vehicle.name,
    dimensions: vehicle.dimensions,
  };
}

/** Duplicated from every other module's own `requireDriverId` rather than shared (AGENTS.md
 *  rule 6). */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/**
 * Fleet vehicles are company-scoped business data (Phase 2 tech design doc §3/§4) — a driver
 * never sees another company's fleet. Every route resolves the caller via `callerDirectory`
 * (identity's own `isAdmin`/`companyId`/`scopes`, AGENTS.md rule 7) and checks it against the
 * target company before doing anything else; `requireDriverId` (401) always runs first, the
 * authorization check (403) second, same order as every other admin-gated route in this codebase.
 */
export function registerFleetRoutes(app: FastifyInstance, deps: FleetRouteDeps): void {
  app.get('/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const companyId = makeId<'CompanyId'>(params.data.companyId);
    const caller = await deps.callerDirectory.getCaller(driverId);
    if (!caller || !canViewFleet(caller, companyId)) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const vehicles = await listFleetVehicles(deps.listFleetVehicles, { companyId });
    return reply.status(200).send({ vehicles: vehicles.map(vehicleDto) });
  });

  app.post('/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    const body = createFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const companyId = makeId<'CompanyId'>(params.data.companyId);
    const caller = await deps.callerDirectory.getCaller(driverId);
    if (!caller || !canManageFleet(caller, companyId)) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const result = await createFleetVehicle(deps.createFleetVehicle, {
      companyId,
      name: body.data.name,
      dimensions: body.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(vehicleDto(result.value));
  });

  app.put('/fleet/vehicles/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    const body = updateFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const existing = await deps.vehicleRepo.findById(makeId<'FleetVehicleId'>(params.data.id));
    if (!existing) {
      return reply.status(404).send({ tag: 'FleetVehicleNotFound', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(driverId);
    if (!caller || !canManageFleet(caller, existing.companyId)) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const result = await updateFleetVehicle(deps.updateFleetVehicle, {
      id: existing.id,
      name: body.data.name,
      dimensions: body.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(vehicleDto(result.value));
  });

  app.delete('/fleet/vehicles/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const existing = await deps.vehicleRepo.findById(makeId<'FleetVehicleId'>(params.data.id));
    if (!existing) {
      return reply.status(404).send({ tag: 'FleetVehicleNotFound', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(driverId);
    if (!caller || !canManageFleet(caller, existing.companyId)) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const result = await deleteFleetVehicle(deps.deleteFleetVehicle, { id: existing.id });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });
}
