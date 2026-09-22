import type { GeoPolygon } from './geo.js';

export type ObstructionKind = 'height' | 'width' | 'weight' | 'prohibition';

/**
 * A candidate restriction near a route (design doc §3) — a spatial hazards query finds what's
 * nearby; `applies()` (avoidance-policy.ts) decides whether it's relevant to a given vehicle.
 * `id` is opaque to routing: it never sees a `HazardReport`, `HazardType` or `HazardStatus`
 * (AGENTS.md rule 7 — cross-context reads use the consuming context's own types).
 */
export interface ReportedObstruction {
  readonly id: string;
  readonly kind: ObstructionKind;
  /** Metres for height/width, tonnes for weight. Absent means no measurement was given — still a
   *  real restriction (design doc §5: "no measurement means avoid for all"). Meaningless for
   *  `prohibition`, a categorical ban with nothing to measure. */
  readonly limit?: number;
  readonly zone: GeoPolygon;
}
