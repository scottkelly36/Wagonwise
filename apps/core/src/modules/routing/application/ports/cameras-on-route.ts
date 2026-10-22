import type { GeoLine } from '../../domain/geo.js';
import type { RouteCamera } from '../../domain/route-camera.js';

/**
 * Routing's read-model port onto the cameras module: the cameras along a route's line. Same "routing never imports another
 * module's types" reasoning as `HazardsOnRouteQuery` (AGENTS.md rule 7); the adapter translates the facade.
 */
export interface CamerasOnRouteQuery {
  camerasNear(route: GeoLine): Promise<RouteCamera[]>;
}
