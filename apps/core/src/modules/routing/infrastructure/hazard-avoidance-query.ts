import type { AvoidanceCandidate, HazardsModule } from '../../hazards/api.js';
import type { HazardAvoidanceQuery } from '../application/ports/hazard-avoidance.js';
import {
  AVOID_ZONE_HALF_WIDTH_M,
  ON_ROUTE_RADIUS_M,
  bufferPoint,
  decodePolyline,
  type GeoLine,
} from '../domain/geo.js';
import { isOnRoute, type ReportedObstruction } from '../domain/reported-obstruction.js';

function toReportedObstruction(candidate: AvoidanceCandidate): ReportedObstruction {
  return {
    id: candidate.id,
    kind: candidate.kind,
    ...(candidate.limit === undefined ? {} : { limit: candidate.limit }),
    zone: bufferPoint(candidate.location, AVOID_ZONE_HALF_WIDTH_M),
    ...(candidate.onRoadPoint === true ? { roadPoint: candidate.location } : {}),
  };
}

/**
 * The adapter design doc §3 describes: "The adapter in `routing/infrastructure/` calls the
 * hazards facade (`hazards/api.ts`) and translates." Decodes a route's polyline into a corridor of
 * points, asks hazards for avoidance candidates along it, and turns each into routing's own
 * `ReportedObstruction` — the only place routing ever reads anything hazards-shaped, and it never
 * imports `HazardReport`/`HazardType`/`HazardStatus` to do it (AGENTS.md rule 7): `hazards/api.ts`
 * already returns a translated, routing-agnostic shape (`AvoidanceCandidate`).
 *
 * Both users of it (planning a route, and the faster-route check) get the same answer, so neither offers a route under a
 * low bridge that OpenStreetMap maps as a point.
 */
export class HazardAvoidanceQueryAdapter implements HazardAvoidanceQuery {
  constructor(private readonly hazards: Pick<HazardsModule, 'findAvoidanceCandidates'>) {}

  async activeNear(corridor: GeoLine): Promise<ReportedObstruction[]> {
    const points = decodePolyline(corridor);
    const candidates = await this.hazards.findAvoidanceCandidates(points, ON_ROUTE_RADIUS_M);
    // A limit the map holds as a point of a road counts only when the route runs along that road, not over it on a bridge.
    return candidates.map(toReportedObstruction).filter((o) => isOnRoute(o, points));
  }
}
