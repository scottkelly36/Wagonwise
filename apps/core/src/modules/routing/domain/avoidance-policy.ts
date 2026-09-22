import type { ReportedObstruction } from './reported-obstruction.js';
import type { Dimensions } from './vehicle-profile.js';

/**
 * The most safety-critical function in Phase 1 (design doc §3) — pure, no I/O, exhaustively
 * tested. Decides whether a reported restriction actually blocks a given vehicle:
 *
 *   - A measured restriction (height/width/weight) applies only when the vehicle exceeds the
 *     limit — a reported 3.5m bridge is only avoided by a vehicle taller than 3.5m. A vehicle
 *     exactly at the limit clears it (a maxheight sign is the tallest height still permitted).
 *   - No measurement at all means avoid for every vehicle (design doc §5) — an unmeasured report
 *     is still a real restriction, and guessing "doesn't apply" would be the unsafe direction to
 *     be wrong in.
 *   - A `prohibition` (e.g. "no HGV") has no numeric measurement to compare against — it always
 *     applies.
 *
 * Community reports can only make routing more cautious, never less (AGENTS.md safety rules).
 * This function can't violate that by construction: it only ever answers about one reported
 * obstruction and never sees, let alone loosens, an official restriction.
 */
export function applies(obstruction: ReportedObstruction, dimensions: Dimensions): boolean {
  switch (obstruction.kind) {
    case 'height':
      return obstruction.limit === undefined || dimensions.heightM > obstruction.limit;
    case 'width':
      return obstruction.limit === undefined || dimensions.widthM > obstruction.limit;
    case 'weight':
      return obstruction.limit === undefined || dimensions.grossWeightT > obstruction.limit;
    case 'prohibition':
      return true;
  }
}
