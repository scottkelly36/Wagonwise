import type { ActiveTrip, ActiveTripId } from '../../domain/active-trip.js';
import type { DriverId } from '../../domain/vehicle-profile.js';

export interface ActiveTripRepository {
  findById(id: ActiveTripId): Promise<ActiveTrip | null>;
  /** The driver's current in-progress trip (`endedAt` unset), if any — how `startTrip` enforces
   *  one active trip per driver at a time. */
  findActiveForDriver(driverId: DriverId): Promise<ActiveTrip | null>;
  /** Upsert — unlike `RoutePlan`, a trip is mutated once, by `endTrip` setting `endedAt`. */
  save(trip: ActiveTrip): Promise<void>;
}
