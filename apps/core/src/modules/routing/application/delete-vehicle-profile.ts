import { err, ok, type Result } from '../../../shared/result.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { VehicleProfileNotFound } from './errors.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface DeleteVehicleProfileDeps {
  readonly repo: VehicleProfileRepository;
}

export interface DeleteVehicleProfileInput {
  readonly id: VehicleProfileId;
  readonly driverId: DriverId;
}

export type DeleteVehicleProfileError = VehicleProfileNotFound;

export async function deleteVehicleProfile(
  deps: DeleteVehicleProfileDeps,
  input: DeleteVehicleProfileInput,
): Promise<Result<void, DeleteVehicleProfileError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing || existing.driverId !== input.driverId) {
    return err({ tag: 'VehicleProfileNotFound' });
  }
  await deps.repo.delete(input.id);
  return ok(undefined);
}
