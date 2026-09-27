import type { DomainEvent } from '../../../../shared/domain-event.js';
import type { GeoPoint, HazardReport, HazardReportId } from '../../domain/hazard-report.js';

export interface HazardRepository {
  findById(id: HazardReportId): Promise<HazardReport | null>;
  /** Spatial candidates within `radiusM` of `location`, most-recently-reported first — the
   *  domain (merge-policy.ts) decides type/recency/status on top of what this returns (design
   *  doc §5: "the repository finds candidates spatially; the domain decides whether they
   *  merge"). Not filtered by type here, so the same spatial query can back both the merge check
   *  and (later) a map viewport query. */
  findNearby(location: GeoPoint, radiusM: number): Promise<HazardReport[]>;
  /** Candidates within `radiusM` of a corridor — a sequence of points along a route, most often
   *  a decoded route polyline. The on-route detection query (design doc §5): `findAvoidanceCandidates`
   *  (`hazards/api.ts`) is its first caller, filtering and classifying what this returns. Needs at
   *  least two points to form a line; a single-point corridor degrades to a plain radius check. */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<HazardReport[]>;
  /** `active` reports whose `expiresAt` has passed — what `expireHazards` acts on. */
  findExpirable(now: Date): Promise<HazardReport[]>;
  /** The dashboard's Hazard reports admin screen (2026-09-27) — every report, any status,
   *  unfiltered by location. Replaces the driver app's own admin-only delete UI, which had no
   *  way to browse hazards in the first place (only ever reachable from a map marker a driver
   *  happened to be looking at). */
  findAll(): Promise<HazardReport[]>;
  /** Upsert — report, confirm, dismiss and expire all persist through this one method; a
   *  HazardReport has no separate insert-only path (mirrors routing's VehicleProfileRepository,
   *  M2.2). `events` (M6.3) are written to the outbox in the same transaction as the row, per
   *  decision 4 — `reportHazard`/`confirmHazard` are the only callers that ever pass any;
   *  dismiss/expire pass none, since nothing consumes those events yet. */
  save(report: HazardReport, events?: readonly DomainEvent[]): Promise<void>;
  /** True removal, unlike `save`'s upsert — the row is gone, not just re-statused. Only
   *  `application/delete-hazard.ts` calls this, and only ever behind an admin check
   *  (interface/routes.ts) — this port itself enforces nothing about who's allowed to call it. */
  deleteById(id: HazardReportId): Promise<void>;
}
