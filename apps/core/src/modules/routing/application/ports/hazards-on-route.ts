import type { GeoLine } from '../../domain/geo.js';

/**
 * Routing's own read-model port onto hazards for *display*, not avoidance — the gap
 * `plan-route.ts` used to leave `hazardsOnRoute` empty for (M3.5 decision), closed here: every
 * active hazard, of any type, within `ON_ROUTE_RADIUS_M` of the final routed line, so a route
 * plan's `hazardsOnRoute` reflects what a driver can already see on the map, not just what
 * routing steered around (`HazardAvoidanceQuery`, blocking types only). Same "routing never
 * imports HazardReport/HazardType" reasoning as that port (AGENTS.md rule 7) — the adapter in
 * `routing/infrastructure/` translates hazards' facade into bare ids.
 */
export interface HazardsOnRouteQuery {
  idsNear(corridor: GeoLine): Promise<string[]>;
}
