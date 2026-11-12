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
  /** When the driver ended it, if the app held the end until it had signal. Kept between the start and now. */
  readonly endedAt?: Date | undefined;
}

export type EndTripError = ActiveTripNotFound;

/** Ending an already-ended trip still 200s, rather than erroring —
 *  no real driver taps "End trip" twice meaning to reopen a finished one, and treating a second
 *  tap as a failure would just be a confusing retry error for no safety benefit (same "sign-out
 *  never fails for tapping it twice" reasoning as identity's revokeSession, M1.5). With no `endedAt` from the app the end moves to now, as it always did.
 *  With one (an end the app held until it had signal) a trip that already has an end keeps it, so a retry cannot move it, and a new end is kept between the
 *  trip's start and now, so a wrong phone clock cannot put it before the trip began or in the future. */
export async function endTrip(
  deps: EndTripDeps,
  input: EndTripInput,
): Promise<Result<ActiveTrip, EndTripError>> {
  const trip = await deps.repo.findById(input.id);
  if (!trip || trip.driverId !== input.driverId) {
    return err({ tag: 'ActiveTripNotFound' });
  }

  const now = deps.clock.now();
  if (input.endedAt !== undefined && trip.endedAt !== undefined) return ok(trip);
  const when =
    input.endedAt === undefined
      ? now
      : new Date(
          Math.min(Math.max(input.endedAt.getTime(), trip.startedAt.getTime()), now.getTime()),
        );
  const ended: ActiveTrip = { ...trip, endedAt: when };
  await deps.repo.save(ended);
  return ok(ended);
}
