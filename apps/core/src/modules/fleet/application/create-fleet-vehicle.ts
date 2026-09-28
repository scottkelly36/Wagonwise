import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  type CompanyId,
  type Dimensions,
  type FleetVehicle,
  type InvalidDimensions,
  type InvalidName,
} from '../domain/vehicle.js';
import { canManageFleet } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface CreateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'save'>;
  readonly ids: IdGenerator;
}

export interface CreateFleetVehicleInput {
  readonly caller: Caller;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly dimensions: Dimensions;
}

export type CreateFleetVehicleError = Forbidden | InvalidName | InvalidDimensions;

export async function createFleetVehicle(
  deps: CreateFleetVehicleDeps,
  input: CreateFleetVehicleInput,
): Promise<Result<FleetVehicle, CreateFleetVehicleError>> {
  if (!canManageFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  const name = validateName(input.name);
  if (!name.ok) {
    return name;
  }
  const dimensions = validateDimensions(input.dimensions);
  if (!dimensions.ok) {
    return dimensions;
  }

  const vehicle: FleetVehicle = {
    id: makeId<'FleetVehicleId'>(deps.ids.newId()),
    companyId: input.companyId,
    name: name.value,
    dimensions: dimensions.value,
  };
  await deps.repo.save(vehicle);
  return ok(vehicle);
}
