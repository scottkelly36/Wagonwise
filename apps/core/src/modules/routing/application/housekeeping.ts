import type { Clock } from '../../../shared/ports/clock.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { RoutingHousekeeping } from './ports/routing-housekeeping.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A trip still running this long after it started was left behind: the driver arrived and closed the app without tapping End
 *  trip. No single trip lasts a day (the daily driving limit is 10 hours), and the app already stops bringing back a trip saved
 *  on the phone after 24 hours (`SAVED_TRIP_MAX_AGE_MS`, the driver app's `lib/saved-trip.ts`); keep the two the same. */
export const ABANDONED_TRIP_AGE_MS = DAY_MS;

/** A driver deleted their account: their vehicle profiles, routes and trips go with it. */
export function eraseDriverRoutingData(
  deps: { readonly housekeeping: RoutingHousekeeping },
  input: { readonly driverId: string },
): Promise<void> {
  return deps.housekeeping.eraseDriver(input.driverId);
}

/**
 * Deletes route plans (and their ended trips) older than `retentionDays`. A planned route holds
 * where the driver set off from, often a home or depot, so it is location history (AGENTS.md; design
 * doc §9) and is not kept indefinitely. A plan a running trip still uses is always kept.
 */
export function pruneOldRoutePlans(
  deps: { readonly housekeeping: RoutingHousekeeping; readonly clock: Clock },
  input: { readonly retentionDays: number },
): Promise<number> {
  const cutoff = new Date(deps.clock.now().getTime() - input.retentionDays * DAY_MS);
  return deps.housekeeping.deletePlansOlderThan(cutoff);
}

/**
 * Ends trips left running for a day or more. Until the driver tapped End trip a trip ran for ever: the app reopened into it days
 * later, the usage page counted it as running now, and its route plan (which holds where the driver set off from) was never
 * deleted, since `pruneOldRoutePlans` keeps any plan a running trip uses. The end is the moment it is found, not a guess at when
 * the driver arrived. Returns how many were ended.
 */
export function endAbandonedTrips(deps: {
  readonly repo: ActiveTripRepository;
  readonly clock: Clock;
}): Promise<number> {
  const now = deps.clock.now();
  return deps.repo.endStartedBefore(new Date(now.getTime() - ABANDONED_TRIP_AGE_MS), now);
}
