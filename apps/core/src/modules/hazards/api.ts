import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresHazardRepository } from './infrastructure/postgres-hazard-repository.js';
import { registerHazardsRoutes, type HazardsRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface HazardsModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
}

export interface HazardsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `hazards`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — same pattern as
 * identity/api.ts and routing/api.ts. No `IdGenerator` dependency, unlike those two modules:
 * every hazards use case takes a caller-supplied id (decision 62, docs/progress.md).
 */
export function createHazardsModule(deps: HazardsModuleDeps): HazardsModule {
  const repo = new PostgresHazardRepository(deps.db);

  const routeDeps: HazardsRouteDeps = {
    reportHazard: { repo, clock: deps.clock },
    confirmHazard: { repo, clock: deps.clock },
    dismissHazard: { repo },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerHazardsRoutes(app, routeDeps);
    },
  };
}
