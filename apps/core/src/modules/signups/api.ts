import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/signups.js';
import {
  PostgresTesterRepository,
  type UntypedDb,
} from './infrastructure/postgres-tester-repository.js';
import { registerSignupRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-tester-repository.js';
export type { CallerDirectory, StaffCaller } from './application/signups.js';

export interface SignupsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
}

export interface SignupsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `signups`' only public surface (AGENTS.md rule 6): the landing page's "register to test" list. Not accounts, just an
 * address and a few words about who is asking, with their agreement to be contacted.
 */
export function createSignupsModule(deps: SignupsModuleDeps): SignupsModule {
  const testers = new PostgresTesterRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerSignupRoutes(app, {
        signups: { testers, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
