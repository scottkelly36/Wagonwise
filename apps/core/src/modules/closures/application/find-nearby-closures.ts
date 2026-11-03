import type { Clock } from '../../../shared/ports/clock.js';
import type { ClosurePoint, NearbyClosures } from '../domain/closure.js';
import type { ClosureRepository } from './closure-repository.js';

export interface FindNearbyClosuresDeps {
  readonly repo: ClosureRepository;
  readonly clock: Clock;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Closures near a point that a driver could meet: in force now, or starting within `withinDays`. Reads our own copy only; no request
 * here ever reaches National Highways.
 */
export function findNearbyClosures(
  deps: FindNearbyClosuresDeps,
  input: {
    readonly centre: ClosurePoint;
    readonly radiusM: number;
    readonly withinDays: number;
    readonly limit: number;
  },
): Promise<NearbyClosures> {
  const now = deps.clock.now();
  return deps.repo.findNearby({
    centre: input.centre,
    radiusM: input.radiusM,
    now,
    startsBefore: new Date(now.getTime() + input.withinDays * DAY_MS),
    limit: input.limit,
  });
}
