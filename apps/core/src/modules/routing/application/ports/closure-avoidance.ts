import type { ClosureCandidate } from '../../domain/closure-on-route.js';
import type { GeoLine } from '../../domain/geo.js';

/**
 * Routing's own read-model port onto road closures (AGENTS.md rule 7): the adapter in `routing/infrastructure/` calls the `closures`
 * facade and translates into {@link ClosureCandidate}, so routing never imports a `Closure`.
 */
export interface ClosureAvoidanceQuery {
  /**
   * Closures whose line comes near the route's line, not yet ended and starting within `withinHours`. Candidates only: whether the
   * route really runs along one, going its way, and whether it is shut when the driver gets there is routing's to decide
   * (AGENTS.md rule 15).
   */
  alongRoute(route: GeoLine, withinHours: number): Promise<ClosureCandidate[]>;
}
