import type { Id } from '../../../shared/brand.js';
import { AVOID_ZONE_HALF_WIDTH_M, bufferPoint, type GeoPoint } from './geo.js';
import type { ObstructionKind, ReportedObstruction } from './reported-obstruction.js';
import type { AvoidedRestriction } from './route-plan.js';

// Infrastructure needs this to type a DB row's `kind` column without reaching past this
// module-internal facade into `reported-obstruction.js` directly.
export type { ObstructionKind } from './reported-obstruction.js';

export type RestrictionOverrideId = Id<'RestrictionOverrideId'>;

/**
 * A manually-verified correction to what Valhalla/OSM has wrong or missing for the test area
 * (design doc §9's "test-area restriction audit") — e.g. a bridge OSM tags at 4.5m clearance
 * that's really 3.8m, or a weight limit with no OSM tag at all. Seeded directly into
 * `routing.restriction_overrides` (no admin UI in Phase 1, same "seeded manually" precedent as
 * `identity.invite_codes`) — folded into route planning exactly like a community hazard report is
 * (`plan-route.ts`), via the same `ReportedObstruction`/`applies()` machinery, so it costs nothing
 * new to route around one.
 */
export interface RestrictionOverride {
  readonly id: RestrictionOverrideId;
  readonly kind: ObstructionKind;
  /** Metres for height/width, tonnes for weight — same convention as `ReportedObstruction`. */
  readonly limit?: number | undefined;
  readonly location: GeoPoint;
  /** What to call it in `avoidedRestrictions` ("Avoided Styford Bridge — 3.7m limit") — falls
   *  back to a generic label per `kind` when absent. */
  readonly note?: string | undefined;
  readonly createdAt: Date;
}

/** Same buffer-a-point-into-an-avoid-area approach as a hazard's own avoid zone
 *  (`hazard-avoidance-query.ts`'s `toReportedObstruction`) — an override is a point in the real
 *  world, and `RoutingEngine.route()`'s `avoid` needs an area, not a point. */
export function toReportedObstruction(override: RestrictionOverride): ReportedObstruction {
  return {
    id: override.id,
    kind: override.kind,
    ...(override.limit === undefined ? {} : { limit: override.limit }),
    zone: bufferPoint(override.location, AVOID_ZONE_HALF_WIDTH_M),
  };
}

const KIND_LABEL: Record<ObstructionKind, string> = {
  height: 'a low bridge',
  width: 'a width restriction',
  weight: 'a weight limit',
  prohibition: 'a road closed to HGVs',
};

const KIND_UNIT: Record<ObstructionKind, string> = {
  height: 'm',
  width: 'm',
  weight: 't',
  prohibition: '',
};

/** Design doc §4's "Avoided Styford Bridge — 3.7m limit" — the one restriction-explanation case
 *  core can actually build today (`plan-route.ts`'s own doc comment: real OSM restriction data
 *  isn't available for this yet, but a manually-audited override is a known, described fact). */
export function describeAvoidedOverride(override: RestrictionOverride): AvoidedRestriction {
  const label = override.note ?? KIND_LABEL[override.kind];
  if (override.limit === undefined) {
    return { description: `Avoided ${label}` };
  }
  return { description: `Avoided ${label} — ${override.limit}${KIND_UNIT[override.kind]} limit` };
}
