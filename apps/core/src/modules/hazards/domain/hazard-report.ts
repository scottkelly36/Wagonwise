import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type HazardReportId = Id<'HazardReportId'>;

// hazards owns its own DriverId rather than importing identity's, matching routing's own
// precedent (decision 46, docs/progress.md) — same brand name, so a value identity produces is
// usable here via makeId(), with no cross-module import.
export type DriverId = Id<'DriverId'>;

export type HazardType =
  | 'low_bridge'
  | 'weight_limit'
  | 'width_restriction'
  | 'tight_bend'
  | 'roadworks'
  | 'flooding'
  | 'no_hgv'
  | 'other';

export type HazardStatus = 'active' | 'expired' | 'dismissed';

export type MeasurementKind = 'height' | 'width' | 'weight';
export type MeasurementUnit = 'm' | 't';

export interface Measurement {
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly unit: MeasurementUnit;
}

export type ReportSource = 'tap' | 'voice';

// hazards owns its own GeoPoint too, for the same reason — no cross-module import, even though
// routing/domain/geo.ts declares a structurally identical shape.
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface HazardReport {
  readonly id: HazardReportId;
  readonly reporterId: DriverId;
  readonly type: HazardType;
  readonly location: GeoPoint;
  readonly note?: string | undefined;
  readonly measurement?: Measurement | undefined;
  readonly source: ReportSource;
  readonly confirmations: number;
  readonly dismissals: number;
  readonly status: HazardStatus;
  readonly expiresAt?: Date | undefined;
  readonly createdAt: Date;
}

export interface InvalidMeasurement extends TaggedError<'InvalidMeasurement'> {
  readonly reason: 'must_be_positive';
}

/** A measurement on a hazard ("bridge looked like 3.5m") only ever makes routing more cautious
 *  (AGENTS.md safety rules) — but a zero or negative value would silently corrupt that comparison,
 *  the same reasoning as routing's own `validateDimensions` (M2.2). */
export function validateMeasurement(m: Measurement): Result<Measurement, InvalidMeasurement> {
  if (!Number.isFinite(m.value) || m.value <= 0) {
    return err({ tag: 'InvalidMeasurement', reason: 'must_be_positive' });
  }
  return ok(m);
}

/**
 * Blocking types (design doc §5) can become avoid polygons for a vehicle `applies()` (routing
 * domain, M2.4) says is affected; advisory types are shown on the route but never force a
 * reroute — the driver decides. `other` is unclassified by nature (a driver picked it because
 * nothing else fit), so it defaults to advisory: nothing here knows it's safe to route a vehicle
 * around, unlike the four restriction types the design doc names explicitly.
 */
const BLOCKING_TYPES: ReadonlySet<HazardType> = new Set([
  'low_bridge',
  'weight_limit',
  'width_restriction',
  'no_hgv',
]);

export function isBlocking(type: HazardType): boolean {
  return BLOCKING_TYPES.has(type);
}

/**
 * Temporary types get a default expiry unless re-confirmed; permanent types don't expire
 * automatically (design doc §3). The design doc names two examples on each side of this and no
 * more (roadworks/flooding temporary, low_bridge/weight_limit permanent) — the remaining four are
 * a judgement call, recorded here rather than left implicit: width_restriction, no_hgv and
 * tight_bend describe a fixed physical/official feature of the road, so they're grouped with the
 * other permanent restrictions; `other` is the catch-all with no known shape, so it defaults to
 * temporary — safer to require reconfirmation of something unclassified than to let it sit
 * unreviewed forever. Worth revisiting with testers, like the expiry window itself.
 */
const TEMPORARY_TYPES: ReadonlySet<HazardType> = new Set(['roadworks', 'flooding', 'other']);

export function isTemporary(type: HazardType): boolean {
  return TEMPORARY_TYPES.has(type);
}

/** 7 days (design doc §3, "decided 2026-09-21" per docs/progress.md's open questions). */
export const DEFAULT_EXPIRY_DAYS = 7;
const EXPIRY_MS = DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/** `undefined` for a permanent type — there is nothing to expire. */
export function expiryFor(type: HazardType, from: Date): Date | undefined {
  return isTemporary(type) ? new Date(from.getTime() + EXPIRY_MS) : undefined;
}

export function isExpired(report: HazardReport, now: Date): boolean {
  return (
    report.status === 'active' &&
    report.expiresAt !== undefined &&
    report.expiresAt.getTime() <= now.getTime()
  );
}

/** The batch expiry use case's transition for a report `isExpired` has already said yes to. */
export function expire(report: HazardReport): HazardReport {
  return { ...report, status: 'expired' };
}

/**
 * A driver passing an existing hazard confirms it's still there (design doc §5's "Still there?"
 * prompt), or a nearby duplicate report merges into it as an extra confirmation (see
 * merge-policy.ts). Either way: increments `confirmations`, and — for a temporary type — pushes
 * `expiresAt` forward, since "unless re-confirmed" (design doc §3) is exactly what this call is.
 * Reactivates an `expired` report (that's the whole point of "Still there?"), but a `dismissed`
 * report stays dismissed on a single new confirmation — undoing a community dismissal needs more
 * than one person disagreeing with it, and Phase 1 has no proper trust scoring to weigh that with
 * (design doc §3 defers that to Phase 2), so the simplest safe rule is: once dismissed, stays
 * dismissed for now.
 */
export function confirm(report: HazardReport, now: Date): HazardReport {
  return {
    ...report,
    confirmations: report.confirmations + 1,
    status: report.status === 'dismissed' ? report.status : 'active',
    expiresAt: isTemporary(report.type) ? expiryFor(report.type, now) : report.expiresAt,
  };
}

/** Simple thresholds for now, proper trust scoring in Phase 2 (design doc §3) — a report moves to
 *  `dismissed` once dismissals outnumber confirmations by this margin. A guess, like the expiry
 *  window; revisit once testers are actually dismissing reports. */
export const DISMISS_MARGIN = 3;

/**
 * A driver reports a hazard isn't there. Only ever moves an `active` report to `dismissed` — a
 * report that's already `expired` has nothing left to dismiss, and one already `dismissed` stays
 * that way (dismissals only ever count up, so re-dismissing changes nothing about the outcome).
 */
export function dismiss(report: HazardReport): HazardReport {
  const dismissals = report.dismissals + 1;
  const status: HazardStatus =
    report.status === 'active' && dismissals - report.confirmations >= DISMISS_MARGIN
      ? 'dismissed'
      : report.status;
  return { ...report, dismissals, status };
}
