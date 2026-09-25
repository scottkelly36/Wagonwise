import {
  activeTripIdParamsSchema,
  createVehicleProfileRequestSchema,
  planRouteRequestSchema,
  routePlanIdParamsSchema,
  updateVehicleProfileRequestSchema,
  vehicleProfileIdParamsSchema,
} from '@wagonwise/contracts/routing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import {
  createVehicleProfile,
  type CreateVehicleProfileDeps,
} from '../application/create-vehicle-profile.js';
import {
  deleteVehicleProfile,
  type DeleteVehicleProfileDeps,
} from '../application/delete-vehicle-profile.js';
import { endTrip, type EndTripDeps } from '../application/end-trip.js';
import { getActiveTrip, type GetActiveTripDeps } from '../application/get-active-trip.js';
import { getRoutePlan, type GetRoutePlanDeps } from '../application/get-route-plan.js';
import {
  getVehicleProfile,
  type GetVehicleProfileDeps,
} from '../application/get-vehicle-profile.js';
import {
  listVehicleProfiles,
  type ListVehicleProfilesDeps,
} from '../application/list-vehicle-profiles.js';
import { planRoute, type PlanRouteDeps } from '../application/plan-route.js';
import { startTrip, type StartTripDeps } from '../application/start-trip.js';
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
  readonly getRoutePlan: GetRoutePlanDeps;
  readonly startTrip: StartTripDeps;
  readonly endTrip: EndTripDeps;
  readonly getActiveTrip: GetActiveTripDeps;
}

/**
 * `driverId` never comes from a body or query field a caller supplied — `request.driverId` is
 * set by `host/driver-auth.ts`'s hook, which must run before any of these handlers (wired in
 * `compose-core.ts`, M4.2). Reachable only by a trusted BFF via `X-Internal-Key`
 * (host/internal-auth.ts) *and* a verified access token — closes the gap M2.2 recorded.
 */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    // Only reachable if this route were ever registered without host/driver-auth.ts's hook in
    // front of it — a wiring bug, not a request shape a driver can trigger. Fails closed.
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

export function registerRoutingRoutes(app: FastifyInstance, deps: RoutingRouteDeps): void {
  app.post('/routing/vehicle-profiles', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const parsed = createVehicleProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await createVehicleProfile(deps.createVehicleProfile, {
      driverId,
      name: parsed.data.name,
      dimensions: parsed.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  app.get('/routing/vehicle-profiles', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const profiles = await listVehicleProfiles(deps.listVehicleProfiles, { driverId });
    return reply.status(200).send(profiles);
  });

  app.get('/routing/vehicle-profiles/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getVehicleProfile(deps.getVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.put('/routing/vehicle-profiles/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    const body = updateVehicleProfileRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await updateVehicleProfile(deps.updateVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId,
      name: body.data.name,
      dimensions: body.data.dimensions,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.delete('/routing/vehicle-profiles/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = vehicleProfileIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deleteVehicleProfile(deps.deleteVehicleProfile, {
      id: makeId<'VehicleProfileId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  app.post('/routing/route-plans', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const parsed = planRouteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await planRoute(deps.planRoute, {
      driverId,
      profileId: makeId<'VehicleProfileId'>(parsed.data.profileId),
      origin: parsed.data.origin,
      destination: parsed.data.destination,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  app.get('/routing/route-plans/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getRoutePlan(deps.getRoutePlan, {
      id: makeId<'RoutePlanId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.post('/routing/route-plans/:id/trip', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await startTrip(deps.startTrip, {
      driverId,
      routePlanId: makeId<'RoutePlanId'>(params.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  app.post('/routing/trips/:id/end', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = activeTripIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await endTrip(deps.endTrip, {
      id: makeId<'ActiveTripId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  // Always 200, `trip: null` when there isn't one — lets the driver app resume a trip its
  // ephemeral local store lost track of after a relaunch (M5.6's known deviation), and lets
  // plan-route offer to end an orphaned trip when `startTrip` rejects with `TripAlreadyActive`.
  app.get('/routing/trips/active', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const trip = await getActiveTrip(deps.getActiveTrip, { driverId });
    return reply.status(200).send({ trip });
  });
}
