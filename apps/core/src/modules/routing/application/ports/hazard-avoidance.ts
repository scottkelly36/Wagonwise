import type { GeoLine } from '../../domain/geo.js';
import type { ReportedObstruction } from '../../domain/reported-obstruction.js';

/**
 * Routing's own read-model port onto hazards (design doc §3): "routing needs active hazards to
 * build avoid polygons." Owned here, not by hazards — the adapter in `routing/infrastructure/`
 * calls the hazards facade and translates into `ReportedObstruction`, so routing never imports a
 * `HazardReport`, `HazardType` or `HazardStatus` (AGENTS.md rule 7).
 */
export interface HazardAvoidanceQuery {
  activeNear(corridor: GeoLine): Promise<ReportedObstruction[]>;
}
