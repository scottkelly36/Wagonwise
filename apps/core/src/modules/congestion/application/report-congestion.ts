import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  expiryFor,
  validateEstimatedWaitMinutes,
  type CongestionReport,
  type CongestionReportId,
  type DriverId,
  type GeoPoint,
  type InvalidEstimatedWait,
} from '../domain/congestion-report.js';
import type { CongestionRepository } from './ports/congestion-repository.js';

export interface ReportCongestionDeps {
  readonly repo: Pick<CongestionRepository, 'save'>;
  readonly clock: Clock;
}

export interface ReportCongestionInput {
  readonly id: CongestionReportId;
  readonly reporterId: DriverId;
  readonly location: GeoPoint;
  readonly estimatedWaitMinutes: number;
}

export type ReportCongestionError = InvalidEstimatedWait;

/** `id` is client-generated (same offline-queue idempotency pattern as hazards' `reportHazard`,
 *  decision 62) — a retry after a dropped connection must never create a duplicate report. No
 *  merge with a nearby report of the same thing (unlike hazards' merge-policy.ts): several
 *  drivers reporting the same jam just show as several markers for now, a deliberate phase-1
 *  simplification worth revisiting once there's real usage to look at. */
export async function reportCongestion(
  deps: ReportCongestionDeps,
  input: ReportCongestionInput,
): Promise<Result<CongestionReport, ReportCongestionError>> {
  const validated = validateEstimatedWaitMinutes(input.estimatedWaitMinutes);
  if (!validated.ok) {
    return validated;
  }

  const now = deps.clock.now();
  const report: CongestionReport = {
    id: input.id,
    reporterId: input.reporterId,
    location: input.location,
    estimatedWaitMinutes: validated.value,
    createdAt: now,
    expiresAt: expiryFor(validated.value, now),
  };
  await deps.repo.save(report);
  return ok(report);
}
