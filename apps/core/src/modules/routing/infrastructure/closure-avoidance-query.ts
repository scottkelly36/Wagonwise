import type { Closure, ClosuresModule } from '../../closures/api.js';
import type { ClosureAvoidanceQuery } from '../application/ports/closure-avoidance.js';
import type { ClosureCandidate } from '../domain/closure-on-route.js';
import { decodePolyline, type GeoLine } from '../domain/geo.js';

/** More than a route could meet: the busiest corridors have a few dozen closures within 40 m of a long route. */
const MAX_CANDIDATES = 100;

function toCandidate(closure: Closure): ClosureCandidate {
  return {
    id: closure.id,
    kind: closure.kind,
    description: closure.description,
    startsAt: closure.startsAt,
    endsAt: closure.endsAt,
    position: closure.position,
    lines: closure.lines,
  };
}

/**
 * Decodes a route's polyline, asks `closures` for those along it and turns each into routing's own {@link ClosureCandidate}: the only
 * place routing reads anything closures-shaped (AGENTS.md rule 7), as `HazardAvoidanceQueryAdapter` does for hazards.
 */
export class ClosureAvoidanceQueryAdapter implements ClosureAvoidanceQuery {
  constructor(private readonly closures: Pick<ClosuresModule, 'findAlongRoute'>) {}

  async alongRoute(route: GeoLine, withinHours: number): Promise<ClosureCandidate[]> {
    const found = await this.closures.findAlongRoute({
      corridor: decodePolyline(route),
      withinHours,
      limit: MAX_CANDIDATES,
    });
    return found.closures.map(toCandidate);
  }
}
