import {
  findClosuresAlongRouteRequestSchema,
  findNearbyClosuresRequestSchema,
} from '@wagonwise/contracts/closures';
import type { FastifyInstance } from 'fastify';
import { findClosuresAlongRoute } from '../application/find-closures-along-route.js';
import {
  findNearbyClosures,
  type FindNearbyClosuresDeps,
} from '../application/find-nearby-closures.js';
import type { Closure } from '../domain/closure.js';

/** What a driver is told about a closure, wherever it is asked for. */
function closureFields(c: Closure) {
  return {
    id: c.id,
    kind: c.kind,
    // A paused closure is never found, so what is left is one of these two.
    status: c.status === 'active' ? ('active' as const) : ('planned' as const),
    ...(c.road === undefined ? {} : { road: c.road }),
    ...(c.direction === undefined ? {} : { direction: c.direction }),
    description: c.description,
    ...(c.locationText === undefined ? {} : { locationText: c.locationText }),
    ...(c.cause === undefined ? {} : { cause: c.cause }),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    lanesClosed: c.lanesClosed,
    location: c.position,
    updatedAt: c.updatedAt.toISOString(),
  };
}

/**
 * The closures near a point, and along a planned route, for the driver app. POST because the point or route rides in the body, as for
 * parking, cameras and fuel. The host's driver-auth hook requires a verified driver behind the whole `/closures/` prefix; nothing
 * here is per driver. Reads our own copy of the feed only: no request here ever reaches National Highways.
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
        ...closureFields(c),
        distanceM: Math.round(distanceM),
      })),
      ...(found.refreshedAt === undefined ? {} : { refreshedAt: found.refreshedAt.toISOString() }),
    });
  });

  app.post('/closures/along-route', async (request, reply) => {
    const parsed = findClosuresAlongRouteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const found = await findClosuresAlongRoute(deps, parsed.data);
    return reply.status(200).send({
      closures: found.closures.map((c) => ({ ...closureFields(c), lines: c.lines })),
      ...(found.refreshedAt === undefined ? {} : { refreshedAt: found.refreshedAt.toISOString() }),
    });
  });
}
