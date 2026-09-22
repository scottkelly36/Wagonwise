import type { DriverId, VehicleProfile, VehicleProfileId } from '../../domain/vehicle-profile.js';
import type { VehicleProfileRepository } from '../ports/vehicle-profile-repository.js';

export class InMemoryVehicleProfileRepository implements VehicleProfileRepository {
  #byId = new Map<VehicleProfileId, VehicleProfile>();

  findById(id: VehicleProfileId): Promise<VehicleProfile | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  listForDriver(driverId: DriverId): Promise<VehicleProfile[]> {
    const matches = [...this.#byId.values()].filter((p) => p.driverId === driverId);
    return Promise.resolve(matches);
  }

  save(profile: VehicleProfile): Promise<void> {
    this.#byId.set(profile.id, profile);
    return Promise.resolve();
  }

  delete(id: VehicleProfileId): Promise<void> {
    this.#byId.delete(id);
    return Promise.resolve();
  }
}
