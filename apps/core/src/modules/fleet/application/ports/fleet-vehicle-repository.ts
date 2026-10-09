import type { CompanyId, FleetVehicle, FleetVehicleId } from '../../domain/vehicle.js';

export interface FleetVehicleRepository {
  findById(id: FleetVehicleId): Promise<FleetVehicle | null>;
  listForCompany(companyId: CompanyId): Promise<FleetVehicle[]>;
  /** The company's vehicle with this (already tidy) registration, if any. */
  findByRegistration(companyId: CompanyId, registration: string): Promise<FleetVehicle | null>;
  save(vehicle: FleetVehicle): Promise<void>;
  delete(id: FleetVehicleId): Promise<void>;
}
