import type { CompanyId, FleetVehicle } from '../domain/vehicle.js';
import type { FleetVehicleRepository } from './ports/fleet-vehicle-repository.js';

export interface ListFleetVehiclesDeps {
  readonly repo: Pick<FleetVehicleRepository, 'listForCompany'>;
}

export interface ListFleetVehiclesInput {
  readonly companyId: CompanyId;
}

export function listFleetVehicles(
  deps: ListFleetVehiclesDeps,
  input: ListFleetVehiclesInput,
): Promise<FleetVehicle[]> {
  return deps.repo.listForCompany(input.companyId);
}
