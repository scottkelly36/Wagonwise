import type { GeoPoint } from '../../domain/geo.js';

export interface CongestionWait {
  readonly id: string;
  readonly location: GeoPoint;
  readonly waitMinutes: number;
}

/** Routing's own read-model port onto `congestion` (AGENTS.md rule 7): live (unexpired) driver reports near a line. */
export interface CongestionQuery {
  waitsNear(line: readonly GeoPoint[], radiusM: number): Promise<CongestionWait[]>;
}
