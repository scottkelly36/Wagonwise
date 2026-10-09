import { makeId } from '../../shared/brand.js';
import { isActive } from './domain/job.js';
import type { FastifyInstance } from 'fastify';
import { pruneProofPhotos } from './application/prune-proof-photos.js';
import { pruneJobPositions } from './application/prune-job-positions.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/ports/caller-directory.js';
import type {
  DriverDirectory,
  DriverIdentityDirectory,
  JobStartGate,
  VehicleDirectory,
  VehicleNameDirectory,
} from './application/ports/directories.js';
import { sendAssignmentNotice } from './application/job-notices.js';
import type { DriverNotifier } from './application/ports/notices.js';
import type { NavigationProfileProvisioner } from './application/ports/navigation-profile.js';
import type { JobRouteEstimator } from './application/ports/route-estimator.js';
import type { UntypedDb } from './infrastructure/db.js';
import { CachingRouteEstimator } from './infrastructure/caching-route-estimator.js';
import { PostgresJobNoticeRepository } from './infrastructure/postgres-job-notice-repository.js';
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
export { ExpoDriverNotifier, type DriverDevices } from './infrastructure/expo-driver-notifier.js';
export type { DeliveryReport, DriverMessage, DriverNotifier } from './application/ports/notices.js';
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
  /** A company vehicle's name, for the reports (P2-M8). Supplied by composition over fleet. */
  readonly vehicleNames: VehicleNameDirectory;
  /** Travel estimates for a company vehicle (P2-M6.4). Supplied by composition over `fleet`'s
   *  dimensions and `routing`'s `estimateRoute`; this module caches them. */
  readonly routes: JobRouteEstimator;
  /** A routing profile carrying the assigned company vehicle's measurements, for the driver app's
   *  "Start". Supplied by composition over `fleet` and `routing`. */
  readonly navigationProfiles: NavigationProfileProvisioner;
  /** Whether a driver may accept a job on its vehicle, by the company's walk-round check settings. Supplied by
   *  composition over `checks`; without it, nothing is held back. Applies to drivers only, never to dispatchers. */
  readonly startGate?: JobStartGate | undefined;
  /** Pushes a notification to a driver's phones, so they know a job has been assigned. Supplied by composition over
   *  `identity`'s devices; without it nothing is sent and the office sees "no device". */
  readonly notifier?: DriverNotifier | undefined;
}

export interface JobsModule {
  registerRoutes(app: FastifyInstance): void;
  /** Deletes driver positions older than `retentionDays`, across every company (a platform-wide
   *  housekeeping job, so it runs in the platform data scope), and says how many went. */
  pruneOldPositions(retentionDays: number): Promise<number>;
  /** Deletes each company's proof-of-delivery photos older than its own retention (months, by company id). */
  pruneProofPhotos(retentionMonthsByCompany: ReadonlyMap<string, number>): Promise<number>;
  /** The vehicle on the job a driver is on right now (assigned up to at_delivery), or null. For walk-round
   *  checks, which are done on the vehicle the driver is about to take out; supplied by composition. Reads in
   *  the caller's own data scope, so call it inside the driver's request. */
  activeVehicleFor(driverId: string): Promise<string | null>;
  /** The company of the job a driver is on right now (assigned up to at_delivery), or null. Same scope rule. */
  activeCompanyFor(driverId: string): Promise<string | null>;
  /** The drivers on a job for the company right now. */
  activeDriverIds(companyId: string): Promise<string[]>;
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
  const notices = new PostgresJobNoticeRepository(deps.db);
  const noticeDeps = {
    notifier: deps.notifier ?? { notify: () => Promise.resolve({ devices: 0, accepted: 0 }) },
    notices,
    clock: deps.clock,
  };

  const routeDeps: JobsRouteDeps = {
    createJob: { repo, ids: deps.ids, clock: deps.clock },
    assignJob: {
      repo,
      drivers: deps.drivers,
      vehicles: deps.vehicles,
      ids: deps.ids,
      clock: deps.clock,
      announce: async (job) => {
        await sendAssignmentNotice(noticeDeps, job);
      },
    },
    changeStatus: { repo, ids: deps.ids, clock: deps.clock },
    listJobs: { repo },
    getJob: { repo },
    getProofOfDelivery: { repo },
    listPositions: { positions },
    listEtas: { repo, positions, routes },
    notices: { ...noticeDeps, repo },
    report: { repo, drivers: deps.driverIdentities, vehicles: deps.vehicleNames },
    previewRoute: { repo, vehicles: deps.vehicles, routes },
    callerDirectory: deps.callers,
    dataScopes: deps.dataScopes,
  };

  const driverRouteDeps: JobsDriverRouteDeps = {
    currentJob: { repo },
    changeStatus: { repo, ids: deps.ids, clock: deps.clock, startGate: deps.startGate },
    attachProofOfDelivery: { repo },
    recordPosition: { repo, positions, clock: deps.clock },
    navigationProfile: { repo, profiles: deps.navigationProfiles },
    identities: deps.driverIdentities,
    seen: { notices, clock: deps.clock },
    dataScopes: deps.dataScopes,
  };

  return {
    pruneOldPositions(retentionDays: number): Promise<number> {
      return deps.dataScopes.run({ kind: 'platform' }, () =>
        pruneJobPositions({ positions, clock: deps.clock }, { retentionDays }),
      );
    },
    async activeCompanyFor(driverId: string): Promise<string | null> {
      const job = await repo.findActiveForDriver(makeId<'DriverId'>(driverId));
      return job?.companyId ?? null;
    },
    async activeDriverIds(companyId: string): Promise<string[]> {
      const jobs = await repo.listForCompany(makeId<'CompanyId'>(companyId));
      return jobs.flatMap((j) =>
        j.driverId !== undefined && isActive(j.status) ? [j.driverId] : [],
      );
    },
    async activeVehicleFor(driverId: string): Promise<string | null> {
      const job = await repo.findActiveForDriver(makeId<'DriverId'>(driverId));
      return job?.vehicleId ?? null;
    },
    pruneProofPhotos(retentionMonthsByCompany: ReadonlyMap<string, number>): Promise<number> {
      return deps.dataScopes.run({ kind: 'platform' }, () =>
        pruneProofPhotos({ repo, clock: deps.clock }, { retentionMonthsByCompany }),
      );
    },
    registerRoutes(app: FastifyInstance): void {
      registerJobsRoutes(app, routeDeps);
      registerJobsDriverRoutes(app, driverRouteDeps);
    },
  };
}
