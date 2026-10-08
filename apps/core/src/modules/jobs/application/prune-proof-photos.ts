import type { Clock } from '../../../shared/ports/clock.js';
import { makeId } from '../../../shared/brand.js';
import type { JobRepository } from './ports/job-repository.js';

export interface PruneProofPhotosDeps {
  readonly repo: Pick<JobRepository, 'deleteProofOfDeliveryOlderThan'>;
  readonly clock: Clock;
}

/** `months` calendar months before `now` (UTC). */
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Deletes each company's proof-of-delivery photos older than that company's retention (the company chooses, because
 * it is the controller of its delivery records). The job and its record stay; only the photo goes. Returns how many
 * photos were deleted, so the caller can log it. A company with no setting is left alone.
 */
export async function pruneProofPhotos(
  deps: PruneProofPhotosDeps,
  input: { readonly retentionMonthsByCompany: ReadonlyMap<string, number> },
): Promise<number> {
  const now = deps.clock.now();
  let removed = 0;
  for (const [companyId, months] of input.retentionMonthsByCompany) {
    removed += await deps.repo.deleteProofOfDeliveryOlderThan(
      makeId<'CompanyId'>(companyId),
      monthsAgo(now, months),
    );
  }
  return removed;
}
