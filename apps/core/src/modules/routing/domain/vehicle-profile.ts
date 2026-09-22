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
}

export interface InvalidDimensions extends TaggedError<'InvalidDimensions'> {
  readonly reason: 'must_be_positive';
}
export type InvalidName = TaggedError<'InvalidName'>;

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
