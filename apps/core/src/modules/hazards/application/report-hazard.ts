import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  confirm,
  expiryFor,
  validateMeasurement,
  type DriverId,
  type GeoPoint,
  type HazardReport,
  type HazardReportId,
  type HazardType,
  type InvalidMeasurement,
  type Measurement,
  type ReportSource,
} from '../domain/hazard-report.js';
import { findMergeCandidate, MERGE_RADIUS_M } from '../domain/merge-policy.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface ReportHazardDeps {
  readonly repo: HazardRepository;
  readonly clock: Clock;
}

export interface ReportHazardInput {
  /** Client-generated (design doc §5 step 2) — the offline queue's idempotency key. Resubmitting
   *  the same id after a flaky connection never creates a duplicate. */
  readonly id: HazardReportId;
  readonly reporterId: DriverId;
  readonly type: HazardType;
  readonly location: GeoPoint;
  readonly note?: string | undefined;
  readonly measurement?: Measurement | undefined;
  readonly source: ReportSource;
}

export type ReportHazardError = InvalidMeasurement;

/**
 * Files a hazard report (design doc §5): idempotent on `id` (a retry of the same client UUID
 * returns the existing report rather than creating a second one), then checks for a nearby
 * duplicate to merge into as an extra confirmation before creating a fresh report.
 */
export async function reportHazard(
  deps: ReportHazardDeps,
  input: ReportHazardInput,
): Promise<Result<HazardReport, ReportHazardError>> {
  const existing = await deps.repo.findById(input.id);
  if (existing) {
    return ok(existing);
  }

  if (input.measurement) {
    const validated = validateMeasurement(input.measurement);
    if (!validated.ok) {
      return validated;
    }
  }

  const now = deps.clock.now();
  const nearby = await deps.repo.findNearby(input.location, MERGE_RADIUS_M);
  const mergeCandidate = findMergeCandidate(nearby, { type: input.type, at: now });
  if (mergeCandidate) {
    const merged = confirm(mergeCandidate, now);
    await deps.repo.save(merged);
    return ok(merged);
  }

  const report: HazardReport = {
    id: input.id,
    reporterId: input.reporterId,
    type: input.type,
    location: input.location,
    note: input.note,
    measurement: input.measurement,
    source: input.source,
    confirmations: 0,
    dismissals: 0,
    status: 'active',
    expiresAt: expiryFor(input.type, now),
    createdAt: now,
  };
  await deps.repo.save(report);
  return ok(report);
}
