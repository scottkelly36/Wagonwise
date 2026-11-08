import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/sales.js';
import {
  PostgresSalesRepository,
  type UntypedDb,
} from './infrastructure/postgres-sales-repository.js';
import { registerSalesRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-sales-repository.js';
export type { CallerDirectory, StaffCaller } from './application/sales.js';

export interface SalesModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
}

export interface SalesModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `sales`' only public surface (AGENTS.md rule 6): WagonWise's own sales notebook, for WagonWise staff only. The firms being
 * approached, a log of each contact, and which stage each has reached. It sends nothing to anyone.
 */
export function createSalesModule(deps: SalesModuleDeps): SalesModule {
  const sales = new PostgresSalesRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerSalesRoutes(app, {
        sales: { sales, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
