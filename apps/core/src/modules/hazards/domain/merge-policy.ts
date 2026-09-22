import type { HazardReport, HazardType } from './hazard-report.js';

/** "Same type within ~50m in the last 24h" (design doc §5). The radius is the repository's job —
 *  it finds spatial candidates (PostGIS `ST_DWithin`, M3.3) using this same constant, so a
 *  candidate list this function receives is already within range; this function's own job is the
 *  type-match and recency half of "whether they merge." */
export const MERGE_RADIUS_M = 50;
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface NewReportAttempt {
  readonly type: HazardType;
  readonly at: Date;
}

/**
 * "The repository finds candidates spatially; the domain decides whether they merge" (design doc
 * §5). Given spatial candidates already within `MERGE_RADIUS_M`, picks the one a new report
 * attempt should merge into as an extra confirmation instead of becoming its own `HazardReport` —
 * same type, still `active`, and reported within the last 24 hours. Returns the first match;
 * candidates are expected to already be ordered most-recent-first by the repository, so this picks
 * the most recent matching report when more than one qualifies.
 */
export function findMergeCandidate(
  candidates: readonly HazardReport[],
  attempt: NewReportAttempt,
): HazardReport | undefined {
  return candidates.find(
    (candidate) =>
      candidate.type === attempt.type &&
      candidate.status === 'active' &&
      attempt.at.getTime() - candidate.createdAt.getTime() <= MERGE_WINDOW_MS,
  );
}
