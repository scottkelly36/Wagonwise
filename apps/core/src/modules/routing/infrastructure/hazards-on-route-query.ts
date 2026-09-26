import type { HazardsModule } from '../../hazards/api.js';
import type { HazardsOnRouteQuery } from '../application/ports/hazards-on-route.js';
import { decodePolyline, ON_ROUTE_RADIUS_M, type GeoLine } from '../domain/geo.js';

/**
 * Decodes a route's polyline into a corridor of points and asks hazards for every active hazard
 * id near it — the same corridor/radius shape `HazardAvoidanceQueryAdapter` uses, but calling
 * `findHazardIdsNear` (every type) instead of `findAvoidanceCandidates` (blocking types only),
 * since this is a display query, not an avoidance one.
 */
export class HazardsOnRouteQueryAdapter implements HazardsOnRouteQuery {
  constructor(private readonly hazards: Pick<HazardsModule, 'findHazardIdsNear'>) {}

  idsNear(corridor: GeoLine): Promise<string[]> {
    const points = decodePolyline(corridor);
    return this.hazards.findHazardIdsNear(points, ON_ROUTE_RADIUS_M);
  }
}
