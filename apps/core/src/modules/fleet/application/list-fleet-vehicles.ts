import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, FleetVehicle } from '../domain/vehicle.js';
import { canViewFleet } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface ListFleetVehiclesDeps {
  readonly repo: Pick<FleetVehicleRepository, 'listForCompany'>;
}

export interface ListFleetVehiclesInput {
  readonly caller: Caller;
  readonly companyId: CompanyId;
}

export async function listFleetVehicles(
  deps: ListFleetVehiclesDeps,
  input: ListFleetVehiclesInput,
): Promise<Result<FleetVehicle[], Forbidden>> {
  if (!canViewFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.repo.listForCompany(input.companyId));
}
