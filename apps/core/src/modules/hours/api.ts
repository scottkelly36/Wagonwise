import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import { makeId } from '../../shared/brand.js';
import { pruneStale, type HoursDeps } from './application/hours.js';
import type {
  ActiveJobs,
  CallerDirectory,
  DriverCompanies,
  DriverIdentityDirectory,
} from './application/ports.js';
import type { UntypedDb } from './infrastructure/db.js';
import {
  PostgresSettingsRepository,
  PostgresSharingRepository,
  PostgresStatusRepository,
} from './infrastructure/postgres-hours-repositories.js';
import { registerHoursRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  ActiveJobs,
  CallerDirectory,
  DriverCompanies,
  DriverIdentityDirectory,
  StaffCaller,
} from './application/ports.js';

export interface HoursModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A driver's own identifier, for the `driver` data scope. Supplied by composition over `identity`. */
  readonly driverIdentities: DriverIdentityDirectory;
  /** The companies a driver is an active member of. Supplied by composition over `fleet`. */
  readonly driverCompanies: DriverCompanies;
  /** Who is on a job now. Supplied by composition over `jobs`. */
  readonly activeJobs: ActiveJobs;
}

export interface HoursModule {
  /**
   * Deletes statuses not updated for 12 hours; says how many went. A platform-wide housekeeping job, so it runs in the
   * platform data scope.
   */
  pruneStaleStatuses(): Promise<number>;
  /** Removes everything held about a deleted driver. Safe to run twice. Supplied to `identity`'s eraser. */
  eraseDriverData(driverId: string): Promise<void>;
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `hours`' only public surface (AGENTS.md rule 6): letting a driver share their live driving-hours status with a company
 * they drive for. Off unless the firm and the driver have both switched it on; only the latest status is kept.
 */
export function createHoursModule(deps: HoursModuleDeps): HoursModule {
  const statuses = new PostgresStatusRepository(deps.db);
  const sharing = new PostgresSharingRepository(deps.db);
  const hours: HoursDeps = {
    settings: new PostgresSettingsRepository(deps.db),
    sharing,
    statuses,
    companies: deps.driverCompanies,
    jobs: deps.activeJobs,
    clock: deps.clock,
  };
  return {
    pruneStaleStatuses: () =>
      deps.dataScopes.run({ kind: 'platform' }, () => pruneStale({ statuses, clock: deps.clock })),
    eraseDriverData: (driverId) =>
      deps.dataScopes.run({ kind: 'platform' }, async () => {
        await statuses.remove(makeId<'DriverId'>(driverId));
        await sharing.eraseDriver(makeId<'DriverId'>(driverId));
      }),
    registerRoutes(app: FastifyInstance): void {
      registerHoursRoutes(app, {
        hours,
        callerDirectory: deps.callers,
        driverIdentities: deps.driverIdentities,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
