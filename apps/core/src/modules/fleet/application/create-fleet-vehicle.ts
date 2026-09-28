import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  type CompanyId,
  type Dimensions,
  type FleetVehicle,
  type InvalidDimensions,
  type InvalidName,
} from '../domain/vehicle.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface CreateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'save'>;
  readonly ids: IdGenerator;
}

export interface CreateFleetVehicleInput {
  readonly companyId: CompanyId;
  readonly name: string;
  readonly dimensions: Dimensions;
}

export type CreateFleetVehicleError = InvalidName | InvalidDimensions;

export async function createFleetVehicle(
  deps: CreateFleetVehicleDeps,
  input: CreateFleetVehicleInput,
): Promise<Result<FleetVehicle, CreateFleetVehicleError>> {
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
