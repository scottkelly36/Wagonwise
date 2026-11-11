import type { FastifyInstance } from 'fastify';
import { LOW_EMISSION_ZONES, ZONE_BOUNDARY_CREDIT } from '../domain/zones.js';

/**
 * The low emission zones for the dispatcher's live map. Public data, the same for every company, so there is no company scoping: a signed-in staff
 * account is enough (checked by the host's auth hook, and again here as the weather route does). The dashboard draws the outlines and works out which
 * vehicles are inside one; core does not look at where a vehicle is.
 */
export function registerZoneRoutes(app: FastifyInstance): void {
  app.get('/staff/routing/low-emission-zones', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    return reply.status(200).send({
      zones: LOW_EMISSION_ZONES.map((zone) => ({
        id: zone.id,
        name: zone.name,
        penaltyGBP: zone.penaltyGBP,
        enforcedFrom: zone.enforcedFrom,
        rings: zone.rings.map((ring) => ring.map(([lat, lon]) => [lat, lon])),
      })),
      attribution: ZONE_BOUNDARY_CREDIT,
    });
  });
}
