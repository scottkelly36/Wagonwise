import {
  findNearbySafeParkingSpotsRequestSchema,
  listParkingSpotsQuerySchema,
  reportSafeParkingSpotRequestSchema,
  safeParkingSpotIdParamsSchema,
  saveParkingSpotRequestSchema,
} from '@wagonwise/contracts/parking';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import {
  addSpot,
  deleteSpot,
  listSpots,
  updateSpot,
  type AdminParkingDeps,
  type CallerDirectory,
} from '../application/admin-parking.js';
import {
  deleteSafeParkingSpot,
  type DeleteSafeParkingSpotDeps,
} from '../application/delete-safe-parking-spot.js';
import {
  findNearbySafeParkingSpots,
  type FindNearbyParkingDeps,
} from '../application/find-nearby-parking.js';
import {
  reportSafeParkingSpot,
  type ReportSafeParkingSpotDeps,
} from '../application/report-safe-parking-spot.js';
import type { SafeParkingSpot } from '../domain/safe-parking-spot.js';
import { statusFor } from './error-mapping.js';

export interface ParkingRouteDeps {
  readonly reportSafeParkingSpot: ReportSafeParkingSpotDeps;
  readonly findNearbyParking: FindNearbyParkingDeps;
  readonly deleteSafeParkingSpot: DeleteSafeParkingSpotDeps;
  readonly admin: AdminParkingDeps;
  readonly callerDirectory: CallerDirectory;
}

/** Duplicated from every other module's own `requireDriverId` rather than shared — a module is
 *  reachable only through its facade (AGENTS.md rule 6), and there's no shared declaration small
 *  enough to be worth a new one. */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/**
 * Reachable only by a trusted caller via `X-Internal-Key` (host/internal-auth.ts) *and* a
 * verified access token (host/driver-auth.ts, gated on `/parking/` from the start, same as
 * congestion's own routes). M9 scope (docs/progress.md): crowd-sourced safe-parking reports and
 * reading back what's nearby, no dismiss/delete path yet.
 */
export function registerParkingRoutes(app: FastifyInstance, deps: ParkingRouteDeps): void {
  registerStaffParkingRoutes(app, deps);
  app.post('/parking/spots', async (request, reply) => {
    const reporterId = requireDriverId(request, reply);
    if (reporterId === undefined) return reply;

    const parsed = reportSafeParkingSpotRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await reportSafeParkingSpot(deps.reportSafeParkingSpot, {
      id: makeId<'SafeParkingSpotId'>(parsed.data.id),
      reporterId,
      location: parsed.data.location,
      note: parsed.data.note,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  // A driver taking back a spot they just marked (the Undo after a one-tap voice report). Only the
  // reporter's own spot can be deleted; anyone else's looks the same as one that does not exist.
  app.delete('/parking/spots/:id', async (request, reply) => {
    const reporterId = requireDriverId(request, reply);
    if (reporterId === undefined) return reply;

    const params = safeParkingSpotIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deleteSafeParkingSpot(deps.deleteSafeParkingSpot, {
      id: makeId<'SafeParkingSpotId'>(params.data.id),
      reporterId,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  // No requireDriverId call — reading parking spots for the map isn't scoped to a reporter, though
  // the host's driver-auth hook still requires some verified driver behind the whole `/parking/`
  // prefix. POST rather than GET, same reasoning as congestion's own nearby route: a
  // route-corridor query needs a points array in the body.
  app.post('/parking/spots/nearby', async (request, reply) => {
    const parsed = findNearbySafeParkingSpotsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const spots = await findNearbySafeParkingSpots(deps.findNearbyParking, {
      corridor: parsed.data.corridor,
      radiusM: parsed.data.radiusM,
    });
    return reply.status(200).send({ spots });
  });
}

/** The same spot as the drivers' map gets, with the date as text. */
const toDto = (spot: SafeParkingSpot) => ({
  ...spot,
  reportedAt: spot.reportedAt.toISOString(),
});

/**
 * WagonWise staff manage the spots from the dashboard: list and search, add, change, delete any. Platform staff only, checked
 * here and again in each use case. These sit under /staff/, so they use the staff sign-in, not a driver's.
 */
function registerStaffParkingRoutes(app: FastifyInstance, deps: ParkingRouteDeps): void {
  async function staffCaller(request: FastifyRequest, reply: FastifyReply) {
    if (request.staffId === undefined) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      void reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return caller;
  }
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });

  app.get('/staff/parking/spots', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const query = listParkingSpotsQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(request, reply);
    const result = await listSpots(deps.admin, caller, {
      text: query.data.q,
      source: query.data.source,
      limit: query.data.limit,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      spots: result.value.spots.map(toDto),
      total: result.value.total,
      bySource: result.value.bySource,
    });
  });

  app.post('/staff/parking/spots', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const body = saveParkingSpotRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    const result = await addSpot(deps.admin, caller, body.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(toDto(result.value));
  });

  app.put('/staff/parking/spots/:id', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const params = safeParkingSpotIdParamsSchema.safeParse(request.params);
    const body = saveParkingSpotRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    const result = await updateSpot(
      deps.admin,
      caller,
      makeId<'SafeParkingSpotId'>(params.data.id),
      body.data,
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(toDto(result.value));
  });

  app.delete('/staff/parking/spots/:id', async (request, reply) => {
    const caller = await staffCaller(request, reply);
    if (caller === undefined) return reply;
    const params = safeParkingSpotIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const result = await deleteSpot(
      deps.admin,
      caller,
      makeId<'SafeParkingSpotId'>(params.data.id),
    );
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });
}
