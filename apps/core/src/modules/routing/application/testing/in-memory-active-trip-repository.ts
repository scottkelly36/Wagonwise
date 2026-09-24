import { decodePolyline, type GeoPoint } from '../../domain/geo.js';
import type { ActiveTrip, ActiveTripId } from '../../domain/active-trip.js';
import type { DriverId } from '../../domain/vehicle-profile.js';
import type { ActiveTripRepository } from '../ports/active-trip-repository.js';
import type { InMemoryRoutePlanRepository } from './in-memory-route-plan-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — same reasoning as
 *  hazards' own `InMemoryHazardRepository` (M3) and `InMemoryRoutePlanRepository` (M6.4). */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryActiveTripRepository implements ActiveTripRepository {
  #byId = new Map<ActiveTripId, ActiveTrip>();

  /** `findActiveNear` needs a trip's *plan's* geometry — the only place that exists in tests is
   *  the route-plan fake this constructor takes, a one-directional dependency (this fake
   *  imports that one, never the reverse) so the two test doubles never form an import cycle. */
  constructor(private readonly routePlans?: InMemoryRoutePlanRepository) {}

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

  async findActiveNear(location: GeoPoint, radiusM: number): Promise<ActiveTrip[]> {
    if (!this.routePlans) {
      throw new Error('InMemoryActiveTripRepository: findActiveNear needs a routePlans fake');
    }
    const matches: ActiveTrip[] = [];
    for (const trip of this.#byId.values()) {
      if (trip.endedAt !== undefined) continue;
      const plan = await this.routePlans.findById(trip.routePlanId);
      if (!plan) continue;
      const points = decodePolyline(plan.geometry);
      if (points.some((p) => metresBetween(p, location) <= radiusM)) {
        matches.push(trip);
      }
    }
    return matches;
  }
}
