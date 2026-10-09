import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  validateRegistration,
  type CompanyId,
  type Dimensions,
  type FleetVehicle,
  type InvalidDimensions,
  type InvalidName,
  type InvalidRegistration,
} from '../domain/vehicle.js';
import { canManageFleet } from './authorization.js';
import type { CapacityReached, Forbidden, RegistrationTaken } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';
import type { VehicleCapacity } from './ports/vehicle-capacity.js';

export interface CreateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'save' | 'listForCompany' | 'findByRegistration'>;
  readonly capacity: VehicleCapacity;
  readonly ids: IdGenerator;
}

export interface CreateFleetVehicleInput {
  readonly caller: Caller;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly dimensions: Dimensions;
  /** Optional: tidied before it is kept. Blank means none. */
  readonly registration?: string | undefined;
}

export type CreateFleetVehicleError =
  | Forbidden
  | InvalidName
  | InvalidDimensions
  | CapacityReached
  | InvalidRegistration
  | RegistrationTaken;

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

  const registration = validateRegistration(input.registration);
  if (!registration.ok) return registration;
  if (
    registration.value !== undefined &&
    (await deps.repo.findByRegistration(input.companyId, registration.value)) !== null
  ) {
    return err({ tag: 'RegistrationTaken' });
  }

  // The plan covers a number of vehicles (billing). Counted after validation so a typo gets its own message.
  const capacity = await deps.capacity.capacityFor(input.companyId);
  const existing = await deps.repo.listForCompany(input.companyId);
  if (existing.length >= capacity) return err({ tag: 'CapacityReached', capacity });

  const vehicle: FleetVehicle = {
    id: makeId<'FleetVehicleId'>(deps.ids.newId()),
    companyId: input.companyId,
    name: name.value,
    dimensions: dimensions.value,
    ...(registration.value === undefined ? {} : { registration: registration.value }),
  };
  await deps.repo.save(vehicle);
  return ok(vehicle);
}
