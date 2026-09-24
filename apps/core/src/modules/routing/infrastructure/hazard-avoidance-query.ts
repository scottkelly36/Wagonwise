import type { AvoidanceCandidate, HazardsModule } from '../../hazards/api.js';
import type { HazardAvoidanceQuery } from '../application/ports/hazard-avoidance.js';
import {
  AVOID_ZONE_HALF_WIDTH_M,
  ON_ROUTE_RADIUS_M,
  bufferPoint,
  decodePolyline,
  type GeoLine,
} from '../domain/geo.js';
import type { ReportedObstruction } from '../domain/reported-obstruction.js';

function toReportedObstruction(candidate: AvoidanceCandidate): ReportedObstruction {
  return {
    id: candidate.id,
    kind: candidate.kind,
    ...(candidate.limit === undefined ? {} : { limit: candidate.limit }),
    zone: bufferPoint(candidate.location, AVOID_ZONE_HALF_WIDTH_M),
  };
}

/**
 * The adapter design doc §3 describes: "The adapter in `routing/infrastructure/` calls the
 * hazards facade (`hazards/api.ts`) and translates." Decodes a route's polyline into a corridor of
 * points, asks hazards for avoidance candidates along it, and turns each into routing's own
 * `ReportedObstruction` — the only place routing ever reads anything hazards-shaped, and it never
 * imports `HazardReport`/`HazardType`/`HazardStatus` to do it (AGENTS.md rule 7): `hazards/api.ts`
 * already returns a translated, routing-agnostic shape (`AvoidanceCandidate`).
 */
export class HazardAvoidanceQueryAdapter implements HazardAvoidanceQuery {
  constructor(private readonly hazards: Pick<HazardsModule, 'findAvoidanceCandidates'>) {}

  async activeNear(corridor: GeoLine): Promise<ReportedObstruction[]> {
    const points = decodePolyline(corridor);
    const candidates = await this.hazards.findAvoidanceCandidates(points, ON_ROUTE_RADIUS_M);
    return candidates.map(toReportedObstruction);
  }
}
