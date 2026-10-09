import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateDimensions,
  validateName,
  validateRegistration,
  type Dimensions,
  type FleetVehicle,
  type FleetVehicleId,
  type InvalidDimensions,
  type InvalidName,
  type InvalidRegistration,
} from '../domain/vehicle.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { FleetVehicleNotFound, Forbidden, RegistrationTaken } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface UpdateFleetVehicleDeps {
  readonly repo: Pick<FleetVehicleRepository, 'findById' | 'save' | 'findByRegistration'>;
}

export interface UpdateFleetVehicleInput {
  readonly caller: Caller;
  readonly id: FleetVehicleId;
  readonly name: string;
  readonly dimensions: Dimensions;
  /** Optional: tidied before it is kept. Blank means none. */
  readonly registration?: string | undefined;
}

export type UpdateFleetVehicleError =
  | Forbidden
  | InvalidName
  | InvalidDimensions
  | InvalidRegistration
  | RegistrationTaken
  | FleetVehicleNotFound;

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

  // Left out, the registration is kept as it was; sent blank, it is cleared.
  const registration =
    input.registration === undefined
      ? ok(existing.registration)
      : validateRegistration(input.registration);
  if (!registration.ok) return registration;
  if (registration.value !== undefined && registration.value !== existing.registration) {
    const other = await deps.repo.findByRegistration(existing.companyId, registration.value);
    if (other !== null && other.id !== existing.id) return err({ tag: 'RegistrationTaken' });
  }

  const { registration: _before, ...rest } = existing;
  const updated: FleetVehicle = {
    ...rest,
    name: name.value,
    dimensions: dimensions.value,
    ...(registration.value === undefined ? {} : { registration: registration.value }),
  };
  await deps.repo.save(updated);
  return ok(updated);
}
