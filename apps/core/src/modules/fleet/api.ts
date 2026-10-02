import type { FastifyInstance } from 'fastify';
import { makeId } from '../../shared/brand.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/ports/caller-directory.js';
import type {
  CompanyNameDirectory,
  DriverIdentityDirectory,
} from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { InMemoryAttemptLimiter } from './infrastructure/in-memory-attempt-limiter.js';
import { PostgresCompanyCodeRepository } from './infrastructure/postgres-company-code-repository.js';
import { PostgresDriverLinkRepository } from './infrastructure/postgres-driver-link-repository.js';
import { PostgresFleetVehicleRepository } from './infrastructure/postgres-fleet-vehicle-repository.js';
import { registerFleetDriverRoutes } from './interface/driver-routes.js';
import { registerFleetRoutes, type FleetRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CompanyNameDirectory,
  DriverIdentityDirectory,
} from './application/ports/directories.js';
export type { Caller, CallerDirectory } from './application/ports/caller-directory.js';

export interface FleetModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  /** Row-Level Security scope per request (P2-M1.7). */
  readonly dataScopes: DataScopes;
  /** Who's calling (P2-M1.12c: a signed-in staff account). Supplied by composition over
   *  `companies`' `getStaffCaller`; fleet never imports `companies` (AGENTS.md rule 7). */
  readonly callers: CallerDirectory;
  readonly clock: Clock;
  /** For driver links (P2-M2): who a driver is, and company names, in fleet's own terms. */
  readonly driverIdentities: DriverIdentityDirectory;
  readonly companyNames: CompanyNameDirectory;
}

export interface FleetModule {
  registerRoutes(app: FastifyInstance): void;
  /** The company a vehicle belongs to, or null. For `jobs' vehicle directory, supplied by
   *  composition (AGENTS.md rule 7). */
  getVehicleCompanyId(vehicleId: string): Promise<string | null>;
}

/**
 * `fleet`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — same pattern as every other
 * module. Phase 2 tech design doc's first slice (docs/progress.md): just company-owned vehicles,
 * scoped by the staff member's company and `manage_fleet` privilege. Dispatch/Jobs/live map
 * aren't built yet — nothing outside `fleet` needs to know a `FleetVehicle` exists yet either.
 */
export function createFleetModule(deps: FleetModuleDeps): FleetModule {
  const repo = new PostgresFleetVehicleRepository(deps.db);
  const links = new PostgresDriverLinkRepository(deps.db);
  const codes = new PostgresCompanyCodeRepository(deps.db);
  const limiter = new InMemoryAttemptLimiter(deps.clock);

  const routeDeps: FleetRouteDeps = {
    createFleetVehicle: { repo, ids: deps.ids },
    updateFleetVehicle: { repo },
    deleteFleetVehicle: { repo },
    listFleetVehicles: { repo },
    callerDirectory: deps.callers,
    dataScopes: deps.dataScopes,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerFleetRoutes(app, routeDeps);
      registerFleetDriverRoutes(app, {
        links,
        joinWithCode: { links, codes, ids: deps.ids, clock: deps.clock, limiter },
        respond: { links, ids: deps.ids, clock: deps.clock },
        settle: { links, ids: deps.ids, clock: deps.clock },
        identities: deps.driverIdentities,
        companyNames: deps.companyNames,
        dataScopes: deps.dataScopes,
      });
    },
    async getVehicleCompanyId(vehicleId: string): Promise<string | null> {
      const vehicle = await repo.findById(makeId<'FleetVehicleId'>(vehicleId));
      return vehicle?.companyId ?? null;
    },
  };
}
