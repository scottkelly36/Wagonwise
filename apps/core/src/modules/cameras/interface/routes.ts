import { findNearbyCamerasRequestSchema } from '@wagonwise/contracts/cameras';
import type { FastifyInstance } from 'fastify';
import {
  findNearbyCameras,
  type FindNearbyCamerasDeps,
} from '../application/find-nearby-cameras.js';

export interface CameraRouteDeps {
  readonly findNearbyCameras: FindNearbyCamerasDeps;
}

/** At most this many cameras in one answer: a wide view over a city is thousands, and nobody can read them. */
const MAX_CAMERAS = 600;

/**
 * The cameras around the driver or the map view, for the home map when not navigating (a route's own cameras come with the route
 * plan, in `routing`). POST because the points ride in the body, as for parking. The host's driver-auth hook requires a verified
 * driver behind the whole `/cameras/` prefix; nothing here is per driver.
 */
export function registerCameraRoutes(app: FastifyInstance, deps: CameraRouteDeps): void {
  app.post('/cameras/nearby', async (request, reply) => {
    const parsed = findNearbyCamerasRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const cameras = await findNearbyCameras(deps.findNearbyCameras, {
      corridor: parsed.data.corridor,
      radiusM: parsed.data.radiusM,
    });
    return reply.status(200).send({
      cameras: cameras.slice(0, MAX_CAMERAS).map((c) => ({
        id: c.id,
        location: c.location,
        kind: c.kind,
        ...(c.maxspeedMph === undefined ? {} : { maxspeedMph: c.maxspeedMph }),
      })),
    });
  });
}
