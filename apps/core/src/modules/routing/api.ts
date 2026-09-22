import type { FastifyInstance } from 'fastify';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresVehicleProfileRepository } from './infrastructure/postgres-vehicle-profile-repository.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface RoutingModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
}

export interface RoutingModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `routing`'s only public surface (AGENTS.md rule 6). Everything under `domain/`,
 * `application/`, `infrastructure/` and `interface/` is reachable only through here — same
 * pattern as identity/api.ts (M1.5).
 */
export function createRoutingModule(deps: RoutingModuleDeps): RoutingModule {
  const repo = new PostgresVehicleProfileRepository(deps.db);

  const routeDeps: RoutingRouteDeps = {
    createVehicleProfile: { repo, ids: deps.ids },
    updateVehicleProfile: { repo },
    deleteVehicleProfile: { repo },
    getVehicleProfile: { repo },
    listVehicleProfiles: { repo },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerRoutingRoutes(app, routeDeps);
    },
  };
}
