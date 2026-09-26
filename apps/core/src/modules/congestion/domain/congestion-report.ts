import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type CongestionReportId = Id<'CongestionReportId'>;

// congestion owns its own DriverId rather than importing identity's, matching hazards' and
// routing's own precedent (decision 46, docs/progress.md) — same brand name, so a value identity
// produces is usable here with no cross-module import.
export type DriverId = Id<'DriverId'>;

// congestion owns its own GeoPoint too, for the same reason — no cross-module import, even
// though hazards/routing each declare a structurally identical shape.
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface CongestionReport {
  readonly id: CongestionReportId;
  readonly reporterId: DriverId;
  readonly location: GeoPoint;
  readonly estimatedWaitMinutes: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export const MIN_ESTIMATED_WAIT_MINUTES = 1;
// A report claiming a longer wait than this isn't a believable one-off estimate from someone
// sat in it right now — the kind of thing worth a second look before raising, not enforcing here.
export const MAX_ESTIMATED_WAIT_MINUTES = 180;

export interface InvalidEstimatedWait extends TaggedError<'InvalidEstimatedWait'> {
  readonly reason: 'out_of_range';
}

export function validateEstimatedWaitMinutes(
  minutes: number,
): Result<number, InvalidEstimatedWait> {
  if (
    !Number.isFinite(minutes) ||
    minutes < MIN_ESTIMATED_WAIT_MINUTES ||
    minutes > MAX_ESTIMATED_WAIT_MINUTES
  ) {
    return err({ tag: 'InvalidEstimatedWait', reason: 'out_of_range' });
  }
  return ok(minutes);
}

/** The whole expiry rule (design discussion, 2026-09-26): a congestion report times out on its
 *  own, tied directly to the wait time it was reported with — no separate expiry constant like
 *  hazards' 7 days (`DEFAULT_EXPIRY_DAYS`), and no confirm()-driven "unless re-confirmed" either.
 *  If it's still bad after this, the driver behind you reports it again. */
export function expiryFor(estimatedWaitMinutes: number, from: Date): Date {
  return new Date(from.getTime() + estimatedWaitMinutes * 60_000);
}

export function isExpired(report: CongestionReport, now: Date): boolean {
  return report.expiresAt.getTime() <= now.getTime();
}
