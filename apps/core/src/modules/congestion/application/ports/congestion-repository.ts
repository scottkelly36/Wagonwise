import type { CongestionReport, GeoPoint } from '../../domain/congestion-report.js';

export interface CongestionRepository {
  /** Candidates within `radiusM` of a corridor — a sequence of points, most often "near me" (one
   *  point) or a decoded route polyline. Mirrors hazards' own `findNearbyLine` (same rationale:
   *  a single-point corridor degrades to a plain radius check). Not filtered by expiry here —
   *  `find-nearby-congestion.ts` does that against the current time, the same split hazards'
   *  repository/application layers use. */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<CongestionReport[]>;
  /** Insert-only — unlike hazards' `save` (an upsert backing report/confirm/dismiss/expire), a
   *  congestion report has no lifecycle to persist through repeated writes; it's reported once
   *  and left to expire on its own. */
  save(report: CongestionReport): Promise<void>;
}
