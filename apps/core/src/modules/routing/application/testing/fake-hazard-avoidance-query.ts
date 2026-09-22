import type { GeoLine } from '../../domain/geo.js';
import type { ReportedObstruction } from '../../domain/reported-obstruction.js';
import type { HazardAvoidanceQuery } from '../ports/hazard-avoidance.js';

/** Configurable result + a log of every corridor asked about, mirroring `FakeRoutingEngine`. */
export class FakeHazardAvoidanceQuery implements HazardAvoidanceQuery {
  obstructions: ReportedObstruction[] = [];
  readonly corridors: GeoLine[] = [];

  activeNear(corridor: GeoLine): Promise<ReportedObstruction[]> {
    this.corridors.push(corridor);
    return Promise.resolve(this.obstructions);
  }
}
