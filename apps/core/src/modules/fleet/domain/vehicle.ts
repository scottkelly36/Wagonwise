import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type FleetVehicleId = Id<'FleetVehicleId'>;

// fleet owns its own CompanyId/StaffId rather than importing companies' (AGENTS.md
// rule 6/7 — a module is reachable only through its facade, cross-context reads use the
// consuming context's own types). Same brand names (decision 46), so a value either side
// produces is usable here via makeId(), with no import across the module boundary.
export type CompanyId = Id<'CompanyId'>;
export type StaffId = Id<'StaffId'>;

/** Same shape as routing's own `Dimensions` (routing/domain/vehicle-profile.ts) — declared fresh
 *  here rather than imported, for the same reason: a company-owned vehicle and a driver's
 *  personal profile are different aggregates in different bounded contexts that happen to need
 *  the same measurements. */
export interface Dimensions {
  readonly heightM: number;
  readonly widthM: number;
  readonly lengthM: number;
  readonly grossWeightT: number;
  readonly axleWeightT?: number | undefined;
}

/** A company-owned vehicle (Phase 2 tech design doc §3's `fleet` context) — dispatching a job to
 *  it uses these dimensions for routing, not whatever profile the assigned driver last picked
 *  personally (§3's "removes a whole class of mistakes"). Jobs/dispatch aren't built yet
 *  (docs/progress.md) — this is just the vehicle record itself. */
export interface FleetVehicle {
  readonly id: FleetVehicleId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly dimensions: Dimensions;
  /** The registration number, tidy (see `normaliseRegistration`), if the company has entered one. */
  readonly registration?: string | undefined;
}

export interface InvalidDimensions extends TaggedError<'InvalidDimensions'> {
  readonly reason: 'must_be_positive';
}
export type InvalidName = TaggedError<'InvalidName'>;

/** Mirrors routing's own `validateDimensions` exactly (same real-world constraint: a route
 *  request needs every measurement to be a genuine positive number). */
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

export function validateName(raw: string): Result<string, InvalidName> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidName' });
  }
  return ok(trimmed);
}

export interface InvalidRegistration extends TaggedError<'InvalidRegistration'> {
  readonly reason: 'too_short' | 'too_long' | 'bad_characters';
}

/** A registration as it is kept: capitals, with spaces, dashes and the like taken out, so "ab12 cde" is "AB12CDE". */
export function normaliseRegistration(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-.]/g, '');
}

/**
 * A registration number the way it is stored, or `undefined` when none was given (a vehicle may have none yet). Two to
 * eight letters and digits, which covers current plates, older ones and private ones.
 */
export function validateRegistration(
  raw: string | undefined,
): Result<string | undefined, InvalidRegistration> {
  if (raw === undefined) return ok(undefined);
  const registration = normaliseRegistration(raw);
  if (registration === '') return ok(undefined);
  if (!/^[A-Z0-9]+$/.test(registration))
    return err({ tag: 'InvalidRegistration', reason: 'bad_characters' });
  if (registration.length < 2) return err({ tag: 'InvalidRegistration', reason: 'too_short' });
  if (registration.length > 8) return err({ tag: 'InvalidRegistration', reason: 'too_long' });
  return ok(registration);
}
