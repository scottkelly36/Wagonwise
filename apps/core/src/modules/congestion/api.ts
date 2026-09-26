import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import { findNearbyCongestion } from './application/find-nearby-congestion.js';
import type { GeoPoint } from './domain/congestion-report.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCongestionRepository } from './infrastructure/postgres-congestion-repository.js';
import { registerCongestionRoutes, type CongestionRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface CongestionModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
}

/** What a report looks like to another module reading congestion — bare data, no domain type
 *  crossing the boundary (AGENTS.md rule 7), same shape as hazards' `AvoidanceCandidate`. Phase 3
 *  (route-line coloring, docs/progress.md) is the first consumer; nothing calls this yet. */
export interface NearbyCongestionReport {
  readonly id: string;
  readonly location: GeoPoint;
  readonly estimatedWaitMinutes: number;
}

export interface CongestionModule {
  registerRoutes(app: FastifyInstance): void;
  /** Active (non-expired) congestion reports within `radiusM` of a corridor — the read phase 3's
   *  route-line coloring will consume; unused by any other module for now. */
  findNearby(corridor: readonly GeoPoint[], radiusM: number): Promise<NearbyCongestionReport[]>;
}

/**
 * `congestion`'s only public surface (AGENTS.md rule 6). Everything under `domain/`,
 * `application/`, `infrastructure/` and `interface/` is reachable only through here — same
 * pattern as hazards/api.ts and identity/api.ts. Phase 1 (docs/progress.md): crowd-sourced
 * reporting only, no WebTRIS ingestion (phase 2) and no route-line coloring consumer (phase 3)
 * yet — kept as its own bounded context from the start rather than folded into hazards, since a
 * congestion report is a decaying condition (auto-expires off `estimatedWaitMinutes`), not a
 * persistent point obstruction.
 */
export function createCongestionModule(deps: CongestionModuleDeps): CongestionModule {
  const repo = new PostgresCongestionRepository(deps.db);

  const routeDeps: CongestionRouteDeps = {
    reportCongestion: { repo, clock: deps.clock },
    findNearbyCongestion: { repo, clock: deps.clock },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerCongestionRoutes(app, routeDeps);
    },

    async findNearby(
      corridor: readonly GeoPoint[],
      radiusM: number,
    ): Promise<NearbyCongestionReport[]> {
      const nearby = await findNearbyCongestion(routeDeps.findNearbyCongestion, {
        corridor,
        radiusM,
      });
      return nearby.map((report) => ({
        id: report.id,
        location: report.location,
        estimatedWaitMinutes: report.estimatedWaitMinutes,
      }));
    },
  };
}
