import type { CamerasModule } from '../../cameras/api.js';
import type { CamerasOnRouteQuery } from '../application/ports/cameras-on-route.js';
import { decodePolyline, type GeoLine } from '../domain/geo.js';
import { CAMERA_ON_ROUTE_RADIUS_M, type RouteCamera } from '../domain/route-camera.js';

/** Decodes the route's line in full (not thinned: a tight match needs every bend) and asks cameras for those near it. */
export class CamerasOnRouteQueryAdapter implements CamerasOnRouteQuery {
  constructor(private readonly cameras: Pick<CamerasModule, 'findNear'>) {}

  async camerasNear(route: GeoLine): Promise<RouteCamera[]> {
    const near = await this.cameras.findNear(decodePolyline(route), CAMERA_ON_ROUTE_RADIUS_M);
    return near.map((c) => ({
      id: c.id,
      location: c.location,
      kind: c.kind,
      maxspeedMph: c.maxspeedMph,
    }));
  }
}
