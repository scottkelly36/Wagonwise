import { err, ok, type Result } from '../../../shared/result.js';
import type { DriverId, VehicleProfile, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface GetVehicleProfileDeps {
  readonly repo: VehicleProfileRepository;
}

export interface GetVehicleProfileInput {
  readonly id: VehicleProfileId;
  readonly driverId: DriverId;
}

export type GetVehicleProfileError = VehicleProfileNotFound;

export async function getVehicleProfile(
  deps: GetVehicleProfileDeps,
  input: GetVehicleProfileInput,
): Promise<Result<VehicleProfile, GetVehicleProfileError>> {
  const profile = await deps.repo.findById(input.id);
  if (!profile || profile.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }
  return ok(profile);
}
