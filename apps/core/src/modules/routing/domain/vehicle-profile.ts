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
 * given.
 */
export function validateDimensions(d: Dimensions): Result<Dimensions, InvalidDimensions> {
  const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
  if (
    !positive(d.heightM) ||
    !positive(d.widthM) ||
    !positive(d.lengthM) ||
    !positive(d.grossWeightT) ||
    (d.axleWeightT !== undefined && !positive(d.axleWeightT))
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
