import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/ports/caller-directory.js';
import type {
  DriverDirectory,
  DriverIdentityDirectory,
  VehicleDirectory,
} from './application/ports/directories.js';
import type { NavigationProfileProvisioner } from './application/ports/navigation-profile.js';
import type { JobRouteEstimator } from './application/ports/route-estimator.js';
import type { UntypedDb } from './infrastructure/db.js';
import { CachingRouteEstimator } from './infrastructure/caching-route-estimator.js';
import { PostgresJobPositionRepository } from './infrastructure/postgres-job-position-repository.js';
import { PostgresJobRepository } from './infrastructure/postgres-job-repository.js';
import { registerJobsDriverRoutes, type JobsDriverRouteDeps } from './interface/driver-routes.js';
import { registerJobsRoutes, type JobsRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';
export type { Caller, CallerDirectory } from './application/ports/caller-directory.js';
export type {
  JobRouteEstimator,
  RouteEstimate,
  RouteUnavailable,
} from './application/ports/route-estimator.js';
export type {
  DriverDirectory,
  DriverIdentityDirectory,
  VehicleDirectory,
} from './application/ports/directories.js';

export interface JobsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Row-Level Security scope per request (P2-M1.7). */
  readonly dataScopes: DataScopes;
  /** Who's calling (a signed-in staff account). Supplied by composition over `companies`' own
   *  caller directory; jobs never imports `companies` (AGENTS.md rule 7). */
  readonly callers: CallerDirectory;
  /** Which company a driver / vehicle belongs to, in jobs' own terms (AGENTS.md rule 7). */
  readonly drivers: DriverDirectory;
  readonly vehicles: VehicleDirectory;
  /** A driver's own identifier, for the `driver` data scope (P2-M5.1). Supplied by composition
   *  over identity's `getDriverIdentifier`, same as fleet's own driver routes. */
  readonly driverIdentities: DriverIdentityDirectory;
  /** Travel estimates for a company vehicle (P2-M6.4). Supplied by composition over `fleet`'s
   *  dimensions and `routing`'s `estimateRoute`; this module caches them. */
  readonly routes: JobRouteEstimator;
  /** A routing profile carrying the assigned company vehicle's measurements, for the driver app's
   *  "Start". Supplied by composition over `fleet` and `routing`. */
  readonly navigationProfiles: NavigationProfileProvisioner;
}

export interface JobsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `jobs`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — same pattern as every other
 * module. First slice of the Phase 2 tech design doc's §5 (docs/progress.md): the `Job` domain
 * model, create, assign and the status machine (P2-M3). The portal screens (M4) and the driver
 * app's own endpoints (M5) aren't built yet.
 */
export function createJobsModule(deps: JobsModuleDeps): JobsModule {
  const repo = new PostgresJobRepository(deps.db);
  const positions = new PostgresJobPositionRepository(deps.db);
  const routes = new CachingRouteEstimator(deps.routes, deps.clock);

  const routeDeps: JobsRouteDeps = {
    createJob: { repo, ids: deps.ids, clock: deps.clock },
    assignJob: {
      repo,
      drivers: deps.drivers,
      vehicles: deps.vehicles,
      ids: deps.ids,
      clock: deps.clock,
    },
    changeStatus: { repo, ids: deps.ids, clock: deps.clock },
    listJobs: { repo },
    getJob: { repo },
    getProofOfDelivery: { repo },
    listPositions: { positions },
    listEtas: { repo, positions, routes },
    previewRoute: { repo, vehicles: deps.vehicles, routes },
    callerDirectory: deps.callers,
    dataScopes: deps.dataScopes,
  };

  const driverRouteDeps: JobsDriverRouteDeps = {
    currentJob: { repo },
    changeStatus: { repo, ids: deps.ids, clock: deps.clock },
    attachProofOfDelivery: { repo },
    recordPosition: { repo, positions, clock: deps.clock },
    navigationProfile: { repo, profiles: deps.navigationProfiles },
    identities: deps.driverIdentities,
    dataScopes: deps.dataScopes,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerJobsRoutes(app, routeDeps);
      registerJobsDriverRoutes(app, driverRouteDeps);
    },
  };
}
