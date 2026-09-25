import type { ActiveTrip } from '../domain/active-trip.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';

export interface GetActiveTripDeps {
  readonly activeTripRepo: ActiveTripRepository;
}

export interface GetActiveTripInput {
  readonly driverId: DriverId;
}

/** `null` is the ordinary "nothing in progress" outcome, not an error — no `Result` wrapper,
 *  same reasoning as hazards' `findNearbyHazards`. Backs `GET /routing/trips/active`, letting the
 *  driver app resume a trip its ephemeral local store lost track of after a relaunch (M5.6's
 *  known, previously-accepted gap — see `current-active-trip-store.ts`). */
export async function getActiveTrip(
  deps: GetActiveTripDeps,
  input: GetActiveTripInput,
): Promise<ActiveTrip | null> {
  return deps.activeTripRepo.findActiveForDriver(input.driverId);
}
