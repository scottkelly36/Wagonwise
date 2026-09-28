import type { CompanyId, FleetVehicle, FleetVehicleId } from '../../domain/vehicle.js';

export interface FleetVehicleRepository {
  findById(id: FleetVehicleId): Promise<FleetVehicle | null>;
  listForCompany(companyId: CompanyId): Promise<FleetVehicle[]>;
  save(vehicle: FleetVehicle): Promise<void>;
  delete(id: FleetVehicleId): Promise<void>;
}
