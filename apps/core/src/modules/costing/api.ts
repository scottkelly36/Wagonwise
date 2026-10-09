import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { DriverDirectory } from './application/inputs-ports.js';
import type { CallerDirectory, VehicleDirectory } from './application/ports.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresFuelRepository } from './infrastructure/postgres-fuel-repository.js';
import {
  PostgresDriverRateRepository,
  PostgresRunningCostRepository,
} from './infrastructure/postgres-inputs-repositories.js';
import { registerCostingInputsRoutes } from './interface/inputs-routes.js';
import { registerCostingRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type { DriverDirectory } from './application/inputs-ports.js';
export type {
  CallerDirectory,
  StaffCaller,
  VehicleDirectory,
  VehicleSummary,
} from './application/ports.js';

export interface CostingModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The company's vehicles, with their registrations. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
  /** The company's drivers, with the name staff know them by. Supplied by composition over `fleet` and `identity`. */
  readonly drivers: DriverDirectory;
}

export interface CostingModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `costing`'s only public surface (AGENTS.md rule 6): what a company's vehicles cost to run. First, fuel: a card statement
 * imported and matched to vehicles by registration. Driver wages, running costs and the cost of a job build on this.
 */
export function createCostingModule(deps: CostingModuleDeps): CostingModule {
  const fuel = new PostgresFuelRepository(deps.db);
  const runningCosts = new PostgresRunningCostRepository(deps.db);
  const rates = new PostgresDriverRateRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerCostingRoutes(app, {
        fuel: { fuel, vehicles: deps.vehicles, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
      registerCostingInputsRoutes(app, {
        inputs: {
          runningCosts,
          rates,
          drivers: deps.drivers,
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
