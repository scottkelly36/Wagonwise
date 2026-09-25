import type { GeoLine } from '../../domain/geo.js';
import type { HazardsOnRouteQuery } from '../ports/hazards-on-route.js';

/** Configurable result + a log of every corridor asked about, mirroring `FakeHazardAvoidanceQuery`. */
export class FakeHazardsOnRouteQuery implements HazardsOnRouteQuery {
  ids: string[] = [];
  readonly corridors: GeoLine[] = [];

  idsNear(corridor: GeoLine): Promise<string[]> {
    this.corridors.push(corridor);
    return Promise.resolve(this.ids);
  }
}
