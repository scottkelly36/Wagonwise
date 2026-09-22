import type { DriverId, VehicleProfile } from '../domain/vehicle-profile.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface ListVehicleProfilesDeps {
  readonly repo: VehicleProfileRepository;
}

export interface ListVehicleProfilesInput {
  readonly driverId: DriverId;
}

/** No failure mode — a driver with no profiles yet gets an empty list, not an error. */
export function listVehicleProfiles(
  deps: ListVehicleProfilesDeps,
  input: ListVehicleProfilesInput,
): Promise<VehicleProfile[]> {
  return deps.repo.listForDriver(input.driverId);
}
