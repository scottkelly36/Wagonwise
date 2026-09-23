import type { ActiveTrip, ActiveTripId } from '../../domain/active-trip.js';
import type { DriverId } from '../../domain/vehicle-profile.js';
import type { ActiveTripRepository } from '../ports/active-trip-repository.js';

export class InMemoryActiveTripRepository implements ActiveTripRepository {
  #byId = new Map<ActiveTripId, ActiveTrip>();

  findById(id: ActiveTripId): Promise<ActiveTrip | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findActiveForDriver(driverId: DriverId): Promise<ActiveTrip | null> {
    for (const trip of this.#byId.values()) {
      if (trip.driverId === driverId && trip.endedAt === undefined) {
        return Promise.resolve(trip);
      }
    }
    return Promise.resolve(null);
  }

  save(trip: ActiveTrip): Promise<void> {
    this.#byId.set(trip.id, trip);
    return Promise.resolve();
  }
}
