import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { ClosureSourceUnavailable, SnapshotEmpty } from '../domain/closure.js';
import type { ClosureRepository } from './closure-repository.js';
import type { ClosureSource } from './closure-source.js';

/** An empty answer replaces a stored copy only when the stored copy is this small: a handful can truly all end. */
export const MIN_STORED_BEFORE_EMPTY_IS_SUSPECT = 10;

export interface RefreshSummary {
  readonly closures: number;
  readonly refreshedAt: Date;
}

export type RefreshError = ClosureSourceUnavailable | SnapshotEmpty;

/**
 * Fetches the closures feed afresh and makes our stored copy match it. A failed fetch leaves the last good copy in place. So does an
 * empty answer when plenty is stored (the whole network does not reopen in ten minutes; an empty feed is far more likely broken).
 * Closures do end and new ones start, so a smaller or different answer otherwise replaces the copy as it is.
 */
export async function refreshClosures(deps: {
  readonly source: ClosureSource;
  readonly repo: ClosureRepository;
  readonly clock: Clock;
}): Promise<Result<RefreshSummary, RefreshError>> {
  const fetched = await deps.source.fetchClosures();
  if (!fetched.ok) return err(fetched.error);

  if (fetched.value.length === 0) {
    const stored = (await deps.repo.counts()).closures;
    if (stored >= MIN_STORED_BEFORE_EMPTY_IS_SUSPECT) return err({ tag: 'SnapshotEmpty', stored });
  }
  const refreshedAt = deps.clock.now();
  await deps.repo.replaceAll(fetched.value, refreshedAt);
  return ok({ closures: fetched.value.length, refreshedAt });
}
