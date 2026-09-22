import type { Clock } from '../../../shared/ports/clock.js';
import { expire, type HazardReport } from '../domain/hazard-report.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface ExpireHazardsDeps {
  readonly repo: HazardRepository;
  readonly clock: Clock;
}

/**
 * Batch-expires every `active` temporary-type report whose `expiresAt` has passed (design doc
 * §3). Returns the reports it expired, not a `Result` — finding nothing to expire isn't a
 * failure (mirrors `listVehicleProfiles`, M2.2). Meant to be called by a poller once that exists
 * (docs/progress.md, M3 deviations) — this is the use case a scheduler drives, not the scheduler
 * itself.
 */
export async function expireHazards(deps: ExpireHazardsDeps): Promise<HazardReport[]> {
  const now = deps.clock.now();
  const expirable = await deps.repo.findExpirable(now);
  const expired: HazardReport[] = [];
  for (const report of expirable) {
    const next = expire(report);
    await deps.repo.save(next);
    expired.push(next);
  }
  return expired;
}
