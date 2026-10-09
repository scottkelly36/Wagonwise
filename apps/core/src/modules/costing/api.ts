import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory, VehicleDirectory } from './application/ports.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresFuelRepository } from './infrastructure/postgres-fuel-repository.js';
import { registerCostingRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
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
  return {
    registerRoutes(app: FastifyInstance): void {
      registerCostingRoutes(app, {
        fuel: { fuel, vehicles: deps.vehicles, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
