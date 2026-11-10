import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type VehicleProfileId = Id<'VehicleProfileId'>;

// Routing owns its own DriverId rather than importing identity's (AGENTS.md rule 6/7 — a module
// is reachable only through its facade, and cross-context reads use the consuming context's own
// types). Same brand name, so a value identity produces is usable here via makeId(), with no
// import across the module boundary.
export type DriverId = Id<'DriverId'>;

export interface Dimensions {
  readonly heightM: number;
  readonly widthM: number;
  readonly lengthM: number;
  readonly grossWeightT: number;
  /** `| undefined` (not just optional) so a zod-parsed body — whose `.optional()` types the key
   *  exactly this way — is assignable under exactOptionalPropertyTypes without a cast at the call
   *  site (same reasoning as identity's RequestOtpInput.inviteCode). */
  readonly axleWeightT?: number | undefined;
  /** Km/h the vehicle is timed at, if its owner or driver has said (a speed limiter, usually 90 km/h for a lorry). Not sent to the engine's
   *  road costing, only used to time the road once it is chosen (`valhalla-routing-engine.ts`), so it can never change the route. */
  readonly topSpeedKph?: number | undefined;
}

/** The slowest and fastest top speed accepted, in km/h: 19 to 81 mph. Anything outside is a typo, not a vehicle. */
export const MIN_TOP_SPEED_KPH = 30;
export const MAX_TOP_SPEED_KPH = 130;

/** The weight the routing engine is given to find a route that ignores weight limits. Weight is only ever used to
 *  check signed limits (a `maxweight` on a road), so a light figure lets the route use them. It is never shown or
 *  stored; a route found this way is always marked as breaking a weight limit. */
const WEIGHT_LIMITS_IGNORED_T = 3.5;

/** The same vehicle as far as height, width and length go, but light enough that no weight limit stops the route. Only for
 *  the second try, after a route for the real weight was not found, and never without telling the driver. */
export function withoutWeightLimits(d: Dimensions): Dimensions {
  return { ...d, grossWeightT: WEIGHT_LIMITS_IGNORED_T, axleWeightT: undefined };
}

export interface VehicleProfile {
  readonly id: VehicleProfileId;
  readonly driverId: DriverId;
  readonly name: string;
  readonly dimensions: Dimensions;
  /** Optional (M9, docs/progress.md) — sibling to `dimensions`, not part of it: this never gets
   *  sent to Valhalla's truck costing, it only feeds `estimateFuelCostGBP` for the rough
   *  fastest/shortest route-option comparison. A profile with no value set just doesn't get a
   *  cost estimate; nothing forces a number nobody entered. */
  readonly fuelConsumptionL100km?: number | undefined;
}

export interface InvalidDimensions extends TaggedError<'InvalidDimensions'> {
  readonly reason: 'must_be_positive';
}
export type InvalidName = TaggedError<'InvalidName'>;
export interface InvalidFuelConsumption extends TaggedError<'InvalidFuelConsumption'> {
  readonly reason: 'must_be_positive';
}

/**
 * Every dimension a route request sends to Valhalla's truck costing (design doc §4) must be a
 * real, positive measurement — a zero or negative value would silently make `applies()` (M2.4,
 * the safety-critical function) wrong for every restriction check against this profile.
 * `axleWeightT` is optional (design doc's `Dimensions` sketch), but must still be positive when
 * given. `topSpeedKph` is optional too, and when given must be 30 to 130 km/h.
 */
export function validateDimensions(d: Dimensions): Result<Dimensions, InvalidDimensions> {
  const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
  if (
    !positive(d.heightM) ||
    !positive(d.widthM) ||
    !positive(d.lengthM) ||
    !positive(d.grossWeightT) ||
    (d.axleWeightT !== undefined && !positive(d.axleWeightT)) ||
    (d.topSpeedKph !== undefined &&
      !(
        Number.isFinite(d.topSpeedKph) &&
        d.topSpeedKph >= MIN_TOP_SPEED_KPH &&
        d.topSpeedKph <= MAX_TOP_SPEED_KPH
      ))
  ) {
    return err({ tag: 'InvalidDimensions', reason: 'must_be_positive' });
  }
  return ok(d);
}

/** A profile's name is how a driver tells two vehicles apart when picking one to route with
 *  (design doc §8) — never blank. */
export function validateName(raw: string): Result<string, InvalidName> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidName' });
  }
  return ok(trimmed);
}

/** Not part of `validateDimensions` — `fuelConsumptionL100km` isn't a `Dimensions` field (M9's own
 *  scoping: it never reaches Valhalla), so it gets its own guard rather than loosening that
 *  function's signature. Undefined is always valid — a driver who hasn't measured their vehicle's
 *  consumption just doesn't get a cost estimate. */
export function validateFuelConsumption(
  value: number | undefined,
): Result<number | undefined, InvalidFuelConsumption> {
  if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
    return err({ tag: 'InvalidFuelConsumption', reason: 'must_be_positive' });
  }
  return ok(value);
}
