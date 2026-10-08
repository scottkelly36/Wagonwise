import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverMembership,
} from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresPlaceRepository } from './infrastructure/postgres-place-repository.js';
import { registerPlacesRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverMembership,
  StaffCaller,
} from './application/ports/directories.js';

export interface PlacesModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Whether a driver has an active link with a company. Supplied by composition over `fleet`. */
  readonly membership: DriverMembership;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A driver's sign-in, for the `driver` data scope. Supplied by composition over `identity`. */
  readonly driverIdentities: DriverIdentityDirectory;
}

export interface PlacesModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `places`' only public surface (AGENTS.md rule 6): a company's saved places, such as the real gate of
 * a farm whose postcode lands elsewhere, marked once by a driver and kept for future jobs.
 */
export function createPlacesModule(deps: PlacesModuleDeps): PlacesModule {
  const repo = new PostgresPlaceRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerPlacesRoutes(app, {
        places: { repo, membership: deps.membership, clock: deps.clock },
        callerDirectory: deps.callers,
        identities: deps.driverIdentities,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
