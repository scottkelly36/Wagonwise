import {
  findNearbySafeParkingSpotsRequestSchema,
  reportSafeParkingSpotRequestSchema,
} from '@wagonwise/contracts/parking';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import {
  findNearbySafeParkingSpots,
  type FindNearbyParkingDeps,
} from '../application/find-nearby-parking.js';
import {
  reportSafeParkingSpot,
  type ReportSafeParkingSpotDeps,
} from '../application/report-safe-parking-spot.js';
import { statusFor } from './error-mapping.js';

export interface ParkingRouteDeps {
  readonly reportSafeParkingSpot: ReportSafeParkingSpotDeps;
  readonly findNearbyParking: FindNearbyParkingDeps;
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
