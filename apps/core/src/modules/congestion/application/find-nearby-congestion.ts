import type { Clock } from '../../../shared/ports/clock.js';
import { isExpired, type CongestionReport, type GeoPoint } from '../domain/congestion-report.js';
import type { CongestionRepository } from './ports/congestion-repository.js';

export interface FindNearbyCongestionDeps {
  readonly repo: Pick<CongestionRepository, 'findNearbyLine'>;
  readonly clock: Clock;
}

export interface FindNearbyCongestionInput {
  readonly corridor: readonly GeoPoint[];
  readonly radiusM: number;
}

/** Powers the driver app's map markers — one point for "near me" (home screen), several (a
 *  decoded route polyline) for "near my route." Filters out anything whose `expiresAt` has
 *  passed at read time, the same "check now, not a stored status" shape hazards' own
 *  `isExpired()` uses for a report that's active but overdue for `expireHazards` — congestion
 *  has no batch job at all, so this is the only place expiry is ever enforced. */
export async function findNearbyCongestion(
  deps: FindNearbyCongestionDeps,
  input: FindNearbyCongestionInput,
): Promise<CongestionReport[]> {
  const now = deps.clock.now();
  const nearby = await deps.repo.findNearbyLine(input.corridor, input.radiusM);
  return nearby.filter((report) => !isExpired(report, now));
}
