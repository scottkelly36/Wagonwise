import type { FastifyInstance } from 'fastify';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { IdentityModule } from '../identity/api.js';
import type { UntypedDb } from './infrastructure/db.js';
import { IdentityCallerDirectory } from './infrastructure/identity-caller-directory.js';
import { PostgresFleetVehicleRepository } from './infrastructure/postgres-fleet-vehicle-repository.js';
import { registerFleetRoutes, type FleetRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface FleetModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  /** Row-Level Security scope per request (P2-M1.7). */
  readonly dataScopes: DataScopes;
  /** The one cross-context read every fleet route's authorization check needs (AGENTS.md rule 7)
   *  — fleet never imports identity's `Driver` directly, just this one method, wrapped by
   *  `infrastructure/identity-caller-directory.ts`. */
  readonly identity: Pick<IdentityModule, 'getDriverAccess'>;
}

export interface FleetModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `fleet`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — same pattern as every other
 * module. Phase 2 tech design doc's first slice (docs/progress.md): just company-owned vehicles,
 * scoped by an admin/Fleet-user (`manage_fleet` scope) permission check. Dispatch/Jobs/live map
 * aren't built yet — nothing outside `fleet` needs to know a `FleetVehicle` exists yet either.
 */
export function createFleetModule(deps: FleetModuleDeps): FleetModule {
  const repo = new PostgresFleetVehicleRepository(deps.db);
  const callerDirectory = new IdentityCallerDirectory(deps.identity);

  const routeDeps: FleetRouteDeps = {
    createFleetVehicle: { repo, ids: deps.ids },
    updateFleetVehicle: { repo },
    deleteFleetVehicle: { repo },
    listFleetVehicles: { repo },
    vehicleRepo: repo,
    callerDirectory,
    dataScopes: deps.dataScopes,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerFleetRoutes(app, routeDeps);
    },
  };
}
