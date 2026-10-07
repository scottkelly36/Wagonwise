import type { Clock } from '../../../shared/ports/clock.js';
import type { JobPositionRepository } from './ports/job-position-repository.js';

export interface PruneJobPositionsDeps {
  readonly positions: Pick<JobPositionRepository, 'deleteOlderThan'>;
  readonly clock: Clock;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes driver positions older than `retentionDays` (P2-M6 retention). Where a driver has been is
 * personal data (AGENTS.md; design doc §9), so it is kept only as long as the dispatcher's live map
 * and the job's own history can use it. Returns how many rows went, so the caller can log it.
 */
export function pruneJobPositions(
  deps: PruneJobPositionsDeps,
  input: { readonly retentionDays: number },
): Promise<number> {
  const cutoff = new Date(deps.clock.now().getTime() - input.retentionDays * DAY_MS);
  return deps.positions.deleteOlderThan(cutoff);
}
