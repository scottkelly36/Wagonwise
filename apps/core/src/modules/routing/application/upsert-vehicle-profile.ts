import { makeId } from '../../../shared/brand.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  type Dimensions,
  type InvalidDimensions,
  type InvalidName,
  type VehicleProfile,
} from '../domain/vehicle-profile.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface UpsertVehicleProfileDeps {
  readonly repo: Pick<VehicleProfileRepository, 'save'>;
}

export interface UpsertVehicleProfileInput {
  /** Chosen by the caller, so the same company vehicle always lands on the same profile. */
  readonly id: string;
  readonly driverId: string;
  readonly name: string;
  readonly dimensions: Dimensions;
}

export type UpsertVehicleProfileError = InvalidName | InvalidDimensions;

/**
 * Creates or refreshes a driver's routing profile from measurements somebody else owns, for a job
 * routed for a company vehicle (the job's assigned lorry, not whatever the driver last drew up
 * themselves). Routing only ever plans from a profile, so this is how a company vehicle's real
 * height, width, length and weight reach `applies()` and Valhalla's truck costing: the same
 * validation as a driver's own profile, then written over whatever the profile held before, so a
 * dispatcher correcting the vehicle takes effect on the next start. The id is the caller's, which
 * is what makes repeating this idempotent.
 */
export async function upsertVehicleProfile(
  deps: UpsertVehicleProfileDeps,
  input: UpsertVehicleProfileInput,
): Promise<Result<VehicleProfile, UpsertVehicleProfileError>> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const dimensions = validateDimensions(input.dimensions);
  if (!dimensions.ok) return dimensions;

  const profile: VehicleProfile = {
    id: makeId<'VehicleProfileId'>(input.id),
    driverId: makeId<'DriverId'>(input.driverId),
    name: name.value,
    dimensions: dimensions.value,
  };
  await deps.repo.save(profile);
  return ok(profile);
}
