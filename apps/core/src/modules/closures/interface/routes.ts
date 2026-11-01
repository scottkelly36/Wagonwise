import { findNearbyClosuresRequestSchema } from '@wagonwise/contracts/closures';
import type { FastifyInstance } from 'fastify';
import {
  findNearbyClosures,
  type FindNearbyClosuresDeps,
} from '../application/find-nearby-closures.js';

/**
 * The closures near a point, for the driver app's map. POST because the point rides in the body, as for parking, cameras and fuel.
 * The host's driver-auth hook requires a verified driver behind the whole `/closures/` prefix; nothing here is per driver. Reads
 * our own copy of the feed only: no request here ever reaches National Highways.
 */
export function registerClosureRoutes(app: FastifyInstance, deps: FindNearbyClosuresDeps): void {
  app.post('/closures/nearby', async (request, reply) => {
    const parsed = findNearbyClosuresRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const found = await findNearbyClosures(deps, parsed.data);
    return reply.status(200).send({
      closures: found.closures.map(({ closure: c, distanceM }) => ({
        id: c.id,
        kind: c.kind,
        // A paused closure is never found, so what is left is one of these two.
        status: c.status === 'active' ? 'active' : 'planned',
        ...(c.road === undefined ? {} : { road: c.road }),
        ...(c.direction === undefined ? {} : { direction: c.direction }),
        description: c.description,
        ...(c.locationText === undefined ? {} : { locationText: c.locationText }),
        ...(c.cause === undefined ? {} : { cause: c.cause }),
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        lanesClosed: c.lanesClosed,
        location: c.position,
        distanceM: Math.round(distanceM),
        updatedAt: c.updatedAt.toISOString(),
      })),
      ...(found.refreshedAt === undefined ? {} : { refreshedAt: found.refreshedAt.toISOString() }),
    });
  });
}
