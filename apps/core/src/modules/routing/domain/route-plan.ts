import type { Id } from '../../../shared/brand.js';
import type { GeoLine, GeoPoint } from './geo.js';
import type { Maneuver } from './maneuver.js';
import type { DriverId, VehicleProfileId } from './vehicle-profile.js';

export type RoutePlanId = Id<'RoutePlanId'>;

/**
 * Design doc §4's "what was avoided" explanation ("Avoided Styford Bridge — 3.7m limit").
 * Deferred (docs/progress.md, M2.5 deviations): building this for real needs OSM restriction
 * data (maxheight/maxwidth/maxweight tags) core doesn't have direct access to yet — Valhalla's
 * own route response never explains *why* it routed somewhere, only where. Always empty for now;
 * the shape exists so `RoutePlan` already matches the design doc and nothing else has to change
 * when it's populated for real.
 */
export interface AvoidedRestriction {
  readonly description: string;
}

/**
 * A planned route (design doc §3). Immutable — no `RoutePlan` lifecycle in Phase 1 (decision 10):
 * a fresh plan per request, never edited after creation.
 */
export interface RoutePlan {
  readonly id: RoutePlanId;
  readonly driverId: DriverId;
  readonly profileId: VehicleProfileId;
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
  readonly geometry: GeoLine;
  readonly distanceKm: number;
  readonly durationMin: number;
  readonly avoidedRestrictions: readonly AvoidedRestriction[];
  /** Turn-by-turn steps (P2-M10), for spoken directions. Empty for plans made before they existed. */
  readonly maneuvers: readonly Maneuver[];
  /** Opaque ids from the hazards module (AGENTS.md rule 7 — routing never sees a `HazardReport`).
   *  Always empty until M3 gives routing a hazards read-model port to query. */
  readonly hazardsOnRoute: readonly string[];
  readonly createdAt: Date;
  /** A rough estimate, not a quote (M9, docs/progress.md) — `distanceKm × (fuelConsumptionL100km /
   *  100) × fuelPricePerLitreGBP`. Undefined whenever the profile this plan was made from has no
   *  `fuelConsumptionL100km` set — never a guessed or default consumption figure. */
  readonly estimatedFuelCostGBP?: number | undefined;
}
