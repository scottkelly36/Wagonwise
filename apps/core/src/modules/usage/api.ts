import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import { pruneFlowEvents } from './application/flow-events.js';
import type { CallerDirectory } from './application/usage.js';
import { PostgresUsageReader, type UntypedDb } from './infrastructure/postgres-usage-reader.js';
import { PostgresFlowEventRepository } from './infrastructure/postgres-flow-event-repository.js';
import { registerUsageRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-usage-reader.js';
export type { CallerDirectory, StaffCaller } from './application/usage.js';

export interface UsageModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
}

export interface UsageModule {
  registerRoutes(app: FastifyInstance): void;
  /** Deletes flow events older than 90 days; returns how many. Run on a timer by composition. */
  pruneFlowEvents(): Promise<number>;
}

/**
 * `usage`' only public surface (AGENTS.md rule 6): the WagonWise admin's view of how the app is being used. Counts only,
 * and its one table is the anonymous flow events (steps and fixed choices, no driver id: docs/flow-tracking-plan.md).
 */
export function createUsageModule(deps: UsageModuleDeps): UsageModule {
  const reader = new PostgresUsageReader(deps.db);
  const flowEventRepo = new PostgresFlowEventRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerUsageRoutes(app, {
        usage: { reader, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
        flowEvents: { repo: flowEventRepo, clock: deps.clock, ids: deps.ids },
      });
    },
    pruneFlowEvents: () => pruneFlowEvents({ repo: flowEventRepo, clock: deps.clock }),
  };
}
