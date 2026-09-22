import type { AvoidanceCandidate, HazardsModule } from '../../hazards/api.js';
import type { HazardAvoidanceQuery } from '../application/ports/hazard-avoidance.js';
import { bufferPoint, decodePolyline, type GeoLine } from '../domain/geo.js';
import type { ReportedObstruction } from '../domain/reported-obstruction.js';

/** "Within 30 metres" — design doc §5's on-route detection radius. Distinct from hazards' own
 *  ~50m merge-duplicate radius (a different concern, owned by hazards itself). */
const ON_ROUTE_RADIUS_M = 30;

/** How far a reported hazard's avoid-zone box extends in each direction — a guess, not a derived
 *  number, same status as hazards' own `MERGE_RADIUS_M`/`DISMISS_MARGIN`. Big enough to plausibly
 *  cover the road segment a hazard sits on, small enough not to force an unnecessarily wide
 *  detour. Worth revisiting once real routes are tested against it. */
const AVOID_ZONE_HALF_WIDTH_M = 25;

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
