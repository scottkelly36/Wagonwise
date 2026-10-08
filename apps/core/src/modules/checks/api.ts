import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverMembership,
  DriverVehicle,
  VehicleDirectory,
} from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCheckRepository } from './infrastructure/postgres-check-repository.js';
import { PostgresTemplateRepository } from './infrastructure/postgres-template-repository.js';
import { registerChecksDriverRoutes } from './interface/driver-routes.js';
import { registerChecksRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverMembership,
  DriverVehicle,
  StaffCaller,
  VehicleDirectory,
} from './application/ports/directories.js';

export interface ChecksModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The company's vehicles. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
  /** The vehicle on a driver's current job. Supplied by composition over `jobs` and `fleet`. */
  readonly driverVehicle: DriverVehicle;
  /** Whether a driver belongs to a company. Supplied by composition over `fleet`. */
  readonly membership: DriverMembership;
  /** A driver's own identifier, for the `driver` data scope. Supplied by composition over `identity`. */
  readonly driverIdentities: DriverIdentityDirectory;
}

export interface ChecksModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `checks`' only public surface (AGENTS.md rule 6): the driver's daily walk-round check. Each company builds its
 * own check lists; a driver does one on the vehicle for their current job; the office seeing the results and
 * defects follows.
 */
export function createChecksModule(deps: ChecksModuleDeps): ChecksModule {
  const templates = new PostgresTemplateRepository(deps.db);
  const checks = new PostgresCheckRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerChecksRoutes(app, {
        templates: { templates, vehicles: deps.vehicles, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
      registerChecksDriverRoutes(app, {
        checks: {
          templates,
          checks,
          vehicles: deps.vehicles,
          driverVehicle: deps.driverVehicle,
          membership: deps.membership,
          ids: deps.ids,
          clock: deps.clock,
        },
        identities: deps.driverIdentities,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
