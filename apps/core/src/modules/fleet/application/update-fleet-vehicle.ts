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
import { canManageFleet, canViewFleet } from './authorization.js';
import type { FleetVehicleNotFound, Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface UpdateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'findById' | 'save'>;
}

export interface UpdateFleetVehicleInput {
  readonly caller: Caller;
  readonly id: FleetVehicleId;
  readonly name: string;
  readonly dimensions: Dimensions;
}

export type UpdateFleetVehicleError =
  Forbidden | InvalidName | InvalidDimensions | FleetVehicleNotFound;

/** No `companyId` in the input — a vehicle never moves between companies, only its name/
 *  dimensions change (mirrors routing's own `updateVehicleProfile`, which doesn't let `driverId`
 *  move either). A vehicle in a company the caller can't see is `FleetVehicleNotFound`, exactly
 *  like one that doesn't exist, so ids can't be probed; one they can see but not change is
 *  `Forbidden` (`authorization.ts`). */
export async function updateFleetVehicle(
  deps: UpdateFleetVehicleDeps,
  input: UpdateFleetVehicleInput,
): Promise<Result<FleetVehicle, UpdateFleetVehicleError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing || !canViewFleet(input.caller, existing.companyId)) {
    return err({ tag: 'FleetVehicleNotFound' });
  }
  if (!canManageFleet(input.caller, existing.companyId)) {
    return err({ tag: 'Forbidden' });
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
