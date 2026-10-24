import {
  activeTripIdParamsSchema,
  createVehicleProfileRequestSchema,
  fasterRouteCheckRequestSchema,
  tripTrafficRequestSchema,
  planRouteRequestSchema,
  previewRouteOptionsRequestSchema,
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
import { checkFasterRoute, type CheckFasterRouteDeps } from '../application/check-faster-route.js';
import { endTrip, type EndTripDeps } from '../application/end-trip.js';
import { getActiveTrip, type GetActiveTripDeps } from '../application/get-active-trip.js';
import {
  getRouteSpeedLimits,
  type GetRouteSpeedLimitsDeps,
} from '../application/get-route-speed-limits.js';
import { getRouteCameras, type GetRouteCamerasDeps } from '../application/get-route-cameras.js';
import { getRoutePlan, type GetRoutePlanDeps } from '../application/get-route-plan.js';
import { getTripTraffic, type GetTripTrafficDeps } from '../application/get-trip-traffic.js';
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
  previewRouteOptions,
  type PreviewRouteOptionsDeps,
} from '../application/preview-route-options.js';
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
  readonly previewRouteOptions: PreviewRouteOptionsDeps;
  readonly getRoutePlan: GetRoutePlanDeps;
  readonly getRouteSpeedLimits: GetRouteSpeedLimitsDeps;
  readonly getTripTraffic: GetTripTrafficDeps;
  readonly getRouteCameras: GetRouteCamerasDeps;
  readonly startTrip: StartTripDeps;
  readonly endTrip: EndTripDeps;
  readonly getActiveTrip: GetActiveTripDeps;
  readonly checkFasterRoute: CheckFasterRouteDeps;
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
      fuelConsumptionL100km: parsed.data.fuelConsumptionL100km,
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
      fuelConsumptionL100km: body.data.fuelConsumptionL100km,
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
      strategy: parsed.data.strategy,
      originHeadingDeg: parsed.data.originHeadingDeg,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  // Unpersisted (M9, docs/progress.md) — lets a driver compare fastest/shortest before
  // `POST /routing/route-plans` runs the real hazard-avoidance pass and saves anything.
  app.post('/routing/route-options/preview', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const parsed = previewRouteOptionsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await previewRouteOptions(deps.previewRouteOptions, {
      driverId,
      profileId: makeId<'VehicleProfileId'>(parsed.data.profileId),
      origin: parsed.data.origin,
      destination: parsed.data.destination,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({ options: result.value });
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

  // How much live traffic and other drivers' reports add to what is left of the route, for the arrival time. Always 200
  // with numbers (no delay when traffic is off or unknown). Core does not track the lorry, so the app sends where it is.
  app.post('/routing/trips/:id/traffic', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = activeTripIdParamsSchema.safeParse(request.params);
    const body = tripTrafficRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getTripTraffic(deps.getTripTraffic, {
      driverId,
      tripId: makeId<'ActiveTripId'>(params.data.id),
      position: body.data.position,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.get('/routing/route-plans/:id/speed-limits', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getRouteSpeedLimits(deps.getRouteSpeedLimits, {
      id: makeId<'RoutePlanId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({ zones: result.value.zones, bridges: result.value.bridges });
  });

  app.get('/routing/route-plans/:id/cameras', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = routePlanIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getRouteCameras(deps.getRouteCameras, {
      id: makeId<'RoutePlanId'>(params.data.id),
      driverId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      cameras: result.value.map((c) => ({
        id: c.id,
        location: c.location,
        kind: c.kind,
        ...(c.maxspeedMph === undefined ? {} : { maxspeedMph: c.maxspeedMph }),
      })),
    });
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

  // While navigating, the app asks (with its position) whether a clearly quicker route exists. Always 200:
  // `offer: null` is the ordinary answer. Docs: docs/faster-route-scope.md.
  app.post('/routing/trips/:id/faster-route', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const params = activeTripIdParamsSchema.safeParse(request.params);
    const body = fasterRouteCheckRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await checkFasterRoute(deps.checkFasterRoute, {
      driverId,
      tripId: makeId<'ActiveTripId'>(params.data.id),
      position: body.data.position,
      headingDeg: body.data.headingDeg,
      keptKeys: body.data.keptKeys,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({ offer: result.value });
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
