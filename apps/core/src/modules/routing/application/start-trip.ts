import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import type { RoutePlanId } from '../domain/route-plan.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { RoutePlanNotFound, TripAlreadyActive } from './errors.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';

export interface StartTripDeps {
  readonly routePlanRepo: RoutePlanRepository;
  readonly activeTripRepo: ActiveTripRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface StartTripInput {
  readonly driverId: DriverId;
  readonly routePlanId: RoutePlanId;
}

export type StartTripError = RoutePlanNotFound | TripAlreadyActive;

/**
 * Starts a trip from one of the driver's own route plans (design doc §8's "Start trip"). Rejects
 * a second concurrent trip per driver, per `TripAlreadyActive`'s own doc comment.
 */
export async function startTrip(
  deps: StartTripDeps,
  input: StartTripInput,
): Promise<Result<ActiveTrip, StartTripError>> {
  const plan = await deps.routePlanRepo.findById(input.routePlanId);
  if (!plan || plan.driverId !== input.driverId) {
    return err({ tag: 'RoutePlanNotFound' });
  }

  const existing = await deps.activeTripRepo.findActiveForDriver(input.driverId);
  if (existing) {
    return err({ tag: 'TripAlreadyActive' });
  }

  const trip: ActiveTrip = {
    id: makeId<'ActiveTripId'>(deps.ids.newId()),
    routePlanId: plan.id,
    driverId: input.driverId,
    startedAt: deps.clock.now(),
  };
  await deps.activeTripRepo.save(trip);
  return ok(trip);
}
