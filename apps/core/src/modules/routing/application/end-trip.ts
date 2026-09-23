import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { ActiveTrip, ActiveTripId } from '../domain/active-trip.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { ActiveTripNotFound } from './errors.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';

export interface EndTripDeps {
  readonly repo: ActiveTripRepository;
  readonly clock: Clock;
}

export interface EndTripInput {
  readonly id: ActiveTripId;
  readonly driverId: DriverId;
}

export type EndTripError = ActiveTripNotFound;

/** Ending an already-ended trip still 200s with `endedAt` moved to now, rather than erroring —
 *  no real driver taps "End trip" twice meaning to reopen a finished one, and treating a second
 *  tap as a failure would just be a confusing retry error for no safety benefit (same "sign-out
 *  never fails for tapping it twice" reasoning as identity's revokeSession, M1.5). */
export async function endTrip(
  deps: EndTripDeps,
  input: EndTripInput,
): Promise<Result<ActiveTrip, EndTripError>> {
  const trip = await deps.repo.findById(input.id);
  if (!trip || trip.driverId !== input.driverId) {
    return err({ tag: 'ActiveTripNotFound' });
  }

  const ended: ActiveTrip = { ...trip, endedAt: deps.clock.now() };
  await deps.repo.save(ended);
  return ok(ended);
}
