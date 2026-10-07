import type { Clock } from '../../../shared/ports/clock.js';
import type { RoutingHousekeeping } from './ports/routing-housekeeping.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
