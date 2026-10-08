import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { CallerDirectory } from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresBillingDetailsRepository } from './infrastructure/postgres-billing-details-repository.js';
import { registerBillingRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type { CallerDirectory, StaffCaller } from './application/ports/directories.js';

export interface BillingModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
}

export interface BillingModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `billing`'s only public surface (AGENTS.md rule 6): what WagonWise charges companies and the
 * invoices it sends. For now, WagonWise's own billing details; plans, capacity and invoices follow.
 */
export function createBillingModule(deps: BillingModuleDeps): BillingModule {
  const repo = new PostgresBillingDetailsRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerBillingRoutes(app, {
        billing: { repo, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
