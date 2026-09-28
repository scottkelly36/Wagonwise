import { err, ok, type Result } from '../../../shared/result.js';
import type { FleetVehicleId } from '../domain/vehicle.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { FleetVehicleNotFound, Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface DeleteFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'findById' | 'delete'>;
}

export interface DeleteFleetVehicleInput {
  readonly caller: Caller;
  readonly id: FleetVehicleId;
}

export type DeleteFleetVehicleError = Forbidden | FleetVehicleNotFound;

/** Same visibility rule as `updateFleetVehicle`: another company's vehicle is not found. */

export async function deleteFleetVehicle(
  deps: DeleteFleetVehicleDeps,
  input: DeleteFleetVehicleInput,
): Promise<Result<void, DeleteFleetVehicleError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing || !canViewFleet(input.caller, existing.companyId)) {
    return err({ tag: 'FleetVehicleNotFound' });
  }
  if (!canManageFleet(input.caller, existing.companyId)) {
    return err({ tag: 'Forbidden' });
  }
  await deps.repo.delete(input.id);
  return ok(undefined);
}
