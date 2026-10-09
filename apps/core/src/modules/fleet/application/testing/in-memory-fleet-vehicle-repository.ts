import type { CompanyId, FleetVehicle, FleetVehicleId } from '../../domain/vehicle.js';
import type { FleetVehicleRepository } from '../ports/fleet-vehicle-repository.js';

export class InMemoryFleetVehicleRepository implements FleetVehicleRepository {
  #byId = new Map<FleetVehicleId, FleetVehicle>();

  findById(id: FleetVehicleId): Promise<FleetVehicle | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<FleetVehicle[]> {
    return Promise.resolve([...this.#byId.values()].filter((v) => v.companyId === companyId));
  }

  findByRegistration(companyId: CompanyId, registration: string): Promise<FleetVehicle | null> {
    const found = [...this.#byId.values()].find(
      (v) => v.companyId === companyId && v.registration === registration,
    );
    return Promise.resolve(found ?? null);
  }

  save(vehicle: FleetVehicle): Promise<void> {
    this.#byId.set(vehicle.id, vehicle);
    return Promise.resolve();
  }

  delete(id: FleetVehicleId): Promise<void> {
    this.#byId.delete(id);
    return Promise.resolve();
  }
}
