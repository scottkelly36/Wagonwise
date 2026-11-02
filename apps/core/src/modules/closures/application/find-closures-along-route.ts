import type { Clock } from '../../../shared/ports/clock.js';
import type { ClosurePoint, ClosuresAlongRoute } from '../domain/closure.js';
import type { ClosureRepository } from './closure-repository.js';

export interface FindClosuresAlongRouteDeps {
  readonly repo: ClosureRepository;
  readonly clock: Clock;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The closures that lie along a planned route and could be in force when the driver gets there: not ended yet, and starting within
 * `withinHours`. These are candidates: the driver app works out which the route really runs along and when it reaches them. Reads
 * our own copy only; no request here ever reaches National Highways.
 */
export function findClosuresAlongRoute(
  deps: FindClosuresAlongRouteDeps,
  input: {
    readonly corridor: readonly ClosurePoint[];
    readonly withinHours: number;
    readonly limit: number;
  },
): Promise<ClosuresAlongRoute> {
  const now = deps.clock.now();
  return deps.repo.findAlongRoute({
    corridor: input.corridor,
    now,
    startsBefore: new Date(now.getTime() + input.withinHours * HOUR_MS),
    limit: input.limit,
  });
}
