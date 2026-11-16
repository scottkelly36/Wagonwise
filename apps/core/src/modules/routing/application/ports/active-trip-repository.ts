import type { ActiveTrip, ActiveTripId } from '../../domain/active-trip.js';
import type { GeoPoint } from '../../domain/geo.js';
import type { DriverId } from '../../domain/vehicle-profile.js';

export interface ActiveTripRepository {
  findById(id: ActiveTripId): Promise<ActiveTrip | null>;
  /** The driver's current in-progress trip (`endedAt` unset), if any — how `startTrip` enforces
   *  one active trip per driver at a time. */
  findActiveForDriver(driverId: DriverId): Promise<ActiveTrip | null>;
  /** Upsert — unlike `RoutePlan`, a trip is mutated once, by `endTrip` setting `endedAt`. */
  save(trip: ActiveTrip): Promise<void>;
  /** In-progress trips (`endedAt` unset) whose route passes within `radiusM` of `location` —
   *  design doc §6 step 1's "ActiveTrips... whose geometry is within 30m of the new hazard." No
   *  position tracking exists yet (`lastPosition` stays unset — decision, M5.6), so "the trip's
   *  route" means its `RoutePlan`'s own geometry, not a live position (M6.4). */
  findActiveNear(location: GeoPoint, radiusM: number): Promise<ActiveTrip[]>;
  /** Ends every in-progress trip that started before `cutoff`, setting `endedAt` to `endedAt`, and says how many it ended. */
  endStartedBefore(cutoff: Date, endedAt: Date): Promise<number>;
  /** Running trips that started after `startedAfter` and have had no reminder yet, each with its plan's driving time. */
  findReminderCandidates(startedAfter: Date): Promise<ReminderCandidate[]>;
  /** Notes that the trip's reminder went out. False if it already had one or has ended since, so two runs never both send. */
  markReminded(id: ActiveTripId, at: Date): Promise<boolean>;
}

export interface ReminderCandidate {
  readonly trip: ActiveTrip;
  /** The planned route's driving time, from its `RoutePlan`. */
  readonly plannedDurationMin: number;
}
