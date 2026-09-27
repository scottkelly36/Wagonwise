import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateFuelConsumption,
  validateName,
  type Dimensions,
  type DriverId,
  type InvalidDimensions,
  type InvalidFuelConsumption,
  type InvalidName,
  type VehicleProfile,
} from '../domain/vehicle-profile.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface CreateVehicleProfileDeps {
  readonly repo: VehicleProfileRepository;
  readonly ids: IdGenerator;
}

export interface CreateVehicleProfileInput {
  readonly driverId: DriverId;
  readonly name: string;
  readonly dimensions: Dimensions;
  readonly fuelConsumptionL100km?: number | undefined;
}

export type CreateVehicleProfileError = InvalidName | InvalidDimensions | InvalidFuelConsumption;

export async function createVehicleProfile(
  deps: CreateVehicleProfileDeps,
  input: CreateVehicleProfileInput,
): Promise<Result<VehicleProfile, CreateVehicleProfileError>> {
  const name = validateName(input.name);
  if (!name.ok) {
    return name;
  }
  const dimensions = validateDimensions(input.dimensions);
  if (!dimensions.ok) {
    return dimensions;
  }
  const fuelConsumptionL100km = validateFuelConsumption(input.fuelConsumptionL100km);
  if (!fuelConsumptionL100km.ok) {
    return fuelConsumptionL100km;
  }

  const profile: VehicleProfile = {
    id: makeId<'VehicleProfileId'>(deps.ids.newId()),
    driverId: input.driverId,
    name: name.value,
    dimensions: dimensions.value,
    fuelConsumptionL100km: fuelConsumptionL100km.value,
  };
  await deps.repo.save(profile);
  return ok(profile);
}
