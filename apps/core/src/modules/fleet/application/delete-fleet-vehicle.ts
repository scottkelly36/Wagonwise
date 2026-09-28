import { err, ok, type Result } from '../../../shared/result.js';
import type { FleetVehicleId } from '../domain/vehicle.js';
import type { FleetVehicleNotFound } from './errors.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface DeleteFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'findById' | 'delete'>;
}

export interface DeleteFleetVehicleInput {
  readonly id: FleetVehicleId;
}

export type DeleteFleetVehicleError = FleetVehicleNotFound;

export async function deleteFleetVehicle(
  deps: DeleteFleetVehicleDeps,
  input: DeleteFleetVehicleInput,
): Promise<Result<void, DeleteFleetVehicleError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'FleetVehicleNotFound' });
  }
  await deps.repo.delete(input.id);
  return ok(undefined);
}
