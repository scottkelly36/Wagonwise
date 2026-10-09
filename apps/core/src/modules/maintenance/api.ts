import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory, VehicleDirectory } from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresItemTypeRepository } from './infrastructure/postgres-item-type-repository.js';
import { PostgresScheduleRepository } from './infrastructure/postgres-schedule-repository.js';
import { registerMaintenanceRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  StaffCaller,
  VehicleDirectory,
} from './application/ports/directories.js';

export interface MaintenanceModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The company's vehicles, with their registrations. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
}

export interface MaintenanceModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `maintenance`'s only public surface (AGENTS.md rule 6): the things that fall due on a company's vehicles (MOT,
 * safety inspections, service...), which the firm names itself, and when each is next due on each vehicle.
 */
export function createMaintenanceModule(deps: MaintenanceModuleDeps): MaintenanceModule {
  const items = new PostgresItemTypeRepository(deps.db);
  const schedules = new PostgresScheduleRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerMaintenanceRoutes(app, {
        items: { items, vehicles: deps.vehicles, clock: deps.clock },
        schedule: {
          items,
          schedules,
          vehicles: deps.vehicles,
          ids: deps.ids,
          clock: deps.clock,
        },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
