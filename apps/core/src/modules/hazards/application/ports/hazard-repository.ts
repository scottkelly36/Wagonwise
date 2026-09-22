import type { GeoPoint, HazardReport, HazardReportId } from '../../domain/hazard-report.js';

export interface HazardRepository {
  findById(id: HazardReportId): Promise<HazardReport | null>;
  /** Spatial candidates within `radiusM` of `location`, most-recently-reported first — the
   *  domain (merge-policy.ts) decides type/recency/status on top of what this returns (design
   *  doc §5: "the repository finds candidates spatially; the domain decides whether they
   *  merge"). Not filtered by type here, so the same spatial query can back both the merge check
   *  and (later) a map viewport query. */
  findNearby(location: GeoPoint, radiusM: number): Promise<HazardReport[]>;
  /** `active` reports whose `expiresAt` has passed — what `expireHazards` acts on. */
  findExpirable(now: Date): Promise<HazardReport[]>;
  /** Upsert — report, confirm, dismiss and expire all persist through this one method; a
   *  HazardReport has no separate insert-only path (mirrors routing's VehicleProfileRepository,
   *  M2.2). */
  save(report: HazardReport): Promise<void>;
}
