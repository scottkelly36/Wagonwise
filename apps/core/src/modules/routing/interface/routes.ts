import {
  createVehicleProfileRequestSchema,
  driverIdQuerySchema,
  planRouteRequestSchema,
  updateVehicleProfileRequestSchema,
  vehicleProfileIdParamsSchema,
} from '@wagonwise/contracts/routing';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  createVehicleProfile,
  type CreateVehicleProfileDeps,
} from '../application/create-vehicle-profile.js';
import {
  deleteVehicleProfile,
  type DeleteVehicleProfileDeps,
} from '../application/delete-vehicle-profile.js';
import {
  getVehicleProfile,
  type GetVehicleProfileDeps,
} from '../application/get-vehicle-profile.js';
import {
  listVehicleProfiles,
  type ListVehicleProfilesDeps,
} from '../application/list-vehicle-profiles.js';
import { planRoute, type PlanRouteDeps } from '../application/plan-route.js';
import {
  updateVehicleProfile,
  type UpdateVehicleProfileDeps,
} from '../application/update-vehicle-profile.js';
import { statusFor } from './error-mapping.js';

export interface RoutingRouteDeps {
  readonly createVehicleProfile: CreateVehicleProfileDeps;
  readonly updateVehicleProfile: UpdateVehicleProfileDeps;
  readonly deleteVehicleProfile: DeleteVehicleProfileDeps;
  readonly getVehicleProfile: GetVehicleProfileDeps;
  readonly listVehicleProfiles: ListVehicleProfilesDeps;
  readonly planRoute: PlanRouteDeps;
}

/**
 * Internal endpoints, same trust model as identity's (design doc §9): reachable only by a
 * trusted BFF via `X-Internal-Key` (host/internal-auth.ts). `driverId` is taken as a plain
 * request field for now — there is no BFF yet that derives it from a verified access token the
 * way decision 1 eventually wants (that is M4's job, "Driver BFF + auth"); recorded as a known
 * gap in docs/progress.md rather than built ahead of need.
 */
export function registerRoutingRoutes(app: FastifyInstance, deps: RoutingRouteDeps): void {
  app.post('/routing/vehicle-profiles', async (request, reply) => {
    const parsed = createVehicleProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await createVehicleProfile(deps.createVehicleProfile, {
      driverId: makeId<'DriverId'>(parsed.data.driverId),
      name: parsed.data.name,
      dimensions: parsed.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  app.get('/routing/vehicle-profiles', async (request, reply) => {
    const parsed = driverIdQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const profiles = await listVehicleProfiles(deps.listVehicleProfiles, {
      driverId: makeId<'DriverId'>(parsed.data.driverId),
    });
    return reply.status(200).send(profiles);
  });

  app.get('/routing/vehicle-profiles/:id', async (request, reply) => {
    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    const query = driverIdQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getVehicleProfile(deps.getVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId: makeId<'DriverId'>(query.data.driverId),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.put('/routing/vehicle-profiles/:id', async (request, reply) => {
    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    const body = updateVehicleProfileRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await updateVehicleProfile(deps.updateVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId: makeId<'DriverId'>(body.data.driverId),
      name: body.data.name,
      dimensions: body.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.delete('/routing/vehicle-profiles/:id', async (request, reply) => {
    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    const query = driverIdQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deleteVehicleProfile(deps.deleteVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId: makeId<'DriverId'>(query.data.driverId),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  app.post('/routing/route-plans', async (request, reply) => {
    const parsed = planRouteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await planRoute(deps.planRoute, {
      driverId: makeId<'DriverId'>(parsed.data.driverId),
      profileId: makeId<'VehicleProfileId'>(parsed.data.profileId),
      origin: parsed.data.origin,
      destination: parsed.data.destination,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });
}
