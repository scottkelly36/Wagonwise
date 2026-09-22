import type { DriverId, VehicleProfile, VehicleProfileId } from '../../domain/vehicle-profile.js';

export interface VehicleProfileRepository {
  findById(id: VehicleProfileId): Promise<VehicleProfile | null>;
  listForDriver(driverId: DriverId): Promise<VehicleProfile[]>;
  /** Upsert — create and edit both call this; a VehicleProfile has no separate insert-only path. */
  save(profile: VehicleProfile): Promise<void>;
  delete(id: VehicleProfileId): Promise<void>;
}
