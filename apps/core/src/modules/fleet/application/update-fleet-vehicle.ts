import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  type Dimensions,
  type FleetVehicle,
  type FleetVehicleId,
  type InvalidDimensions,
  type InvalidName,
} from '../domain/vehicle.js';
import type { FleetVehicleNotFound } from './errors.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface UpdateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'findById' | 'save'>;
}

export interface UpdateFleetVehicleInput {
  readonly id: FleetVehicleId;
  readonly name: string;
  readonly dimensions: Dimensions;
}

export type UpdateFleetVehicleError = InvalidName | InvalidDimensions | FleetVehicleNotFound;

/** No `companyId` in the input — a vehicle never moves between companies, only its name/
 *  dimensions change (mirrors routing's own `updateVehicleProfile`, which doesn't let `driverId`
 *  move either). `interface/routes.ts`'s own authorization check resolves the existing vehicle's
 *  `companyId` before this ever runs. */
export async function updateFleetVehicle(
  deps: UpdateFleetVehicleDeps,
  input: UpdateFleetVehicleInput,
): Promise<Result<FleetVehicle, UpdateFleetVehicleError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'FleetVehicleNotFound' });
  }

  const name = validateName(input.name);
  if (!name.ok) {
    return name;
  }
  const dimensions = validateDimensions(input.dimensions);
  if (!dimensions.ok) {
    return dimensions;
  }

  const updated: FleetVehicle = { ...existing, name: name.value, dimensions: dimensions.value };
  await deps.repo.save(updated);
  return ok(updated);
}
