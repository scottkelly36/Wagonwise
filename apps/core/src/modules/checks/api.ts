import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory, VehicleDirectory } from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresTemplateRepository } from './infrastructure/postgres-template-repository.js';
import { registerChecksRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
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
  /** Whether a vehicle is the company's. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
}

export interface ChecksModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `checks`' only public surface (AGENTS.md rule 6): the driver's daily walk-round check. Each company builds its
 * own check lists; drivers completing them, and the office seeing the results and defects, follow.
 */
export function createChecksModule(deps: ChecksModuleDeps): ChecksModule {
  const templates = new PostgresTemplateRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerChecksRoutes(app, {
        templates: { templates, vehicles: deps.vehicles, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
