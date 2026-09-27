import { err, ok, type Result } from '../../../shared/result.js';
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
  type VehicleProfileId,
} from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface UpdateVehicleProfileDeps {
  readonly repo: VehicleProfileRepository;
}

export interface UpdateVehicleProfileInput {
  readonly id: VehicleProfileId;
  readonly driverId: DriverId;
  readonly name: string;
  readonly dimensions: Dimensions;
  readonly fuelConsumptionL100km?: number | undefined;
}

export type UpdateVehicleProfileError =
  InvalidName | InvalidDimensions | InvalidFuelConsumption | VehicleProfileNotFound;

export async function updateVehicleProfile(
  deps: UpdateVehicleProfileDeps,
  input: UpdateVehicleProfileInput,
): Promise<Result<VehicleProfile, UpdateVehicleProfileError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing || existing.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }

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

  const updated: VehicleProfile = {
    ...existing,
    name: name.value,
    dimensions: dimensions.value,
    fuelConsumptionL100km: fuelConsumptionL100km.value,
  };
  await deps.repo.save(updated);
  return ok(updated);
}
