import type { Clock } from '../../../shared/ports/clock.js';
import { isExpired, type GeoPoint, type HazardReport } from '../domain/hazard-report.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface FindNearbyHazardsDeps {
  readonly repo: HazardRepository;
  readonly clock: Clock;
}

export interface FindNearbyHazardsInput {
  readonly corridor: readonly GeoPoint[];
  readonly radiusM: number;
}

/** Powers the driver app's map markers — a single-point `corridor` is "near me", several points
 *  (a route polyline) is "near my route" (`findNearbyLine` degrades to a plain radius check for
 *  one point, per its own doc comment). Same active-and-not-expired filter as `hazards/api.ts`'s
 *  `findAvoidanceCandidates`, but keeps every hazard type rather than just the blocking ones — a
 *  driver looking at the map wants to see roadworks and floods too, not only what routing would
 *  avoid. */
export async function findNearbyHazards(
  deps: FindNearbyHazardsDeps,
  input: FindNearbyHazardsInput,
): Promise<HazardReport[]> {
  const now = deps.clock.now();
  const nearby = await deps.repo.findNearbyLine(input.corridor, input.radiusM);
  return nearby.filter((report) => report.status === 'active' && !isExpired(report, now));
}
