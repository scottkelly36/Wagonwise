import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type {
  CallerDirectory,
  PeopleDirectory,
  VehicleDirectory,
} from './application/audit-pack.js';
import { PostgresAuditReader, type UntypedDb } from './infrastructure/postgres-audit-reader.js';
import { registerAuditRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-audit-reader.js';
export type {
  CallerDirectory,
  PeopleDirectory,
  StaffCaller,
  VehicleDirectory,
} from './application/audit-pack.js';

export interface AuditModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A vehicle's company, name and registration. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
  /** Names for drivers and staff. Supplied by composition over `identity` and `companies`. */
  readonly people: PeopleDirectory;
}

export interface AuditModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `audit`'s only public surface (AGENTS.md rule 6): a vehicle's walk-round checks, defects, repairs and maintenance for a
 * period, in one report a firm can print or hand over. Read-only, no table of its own.
 */
export function createAuditModule(deps: AuditModuleDeps): AuditModule {
  const reader = new PostgresAuditReader(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerAuditRoutes(app, {
        audit: {
          reader,
          vehicles: deps.vehicles,
          people: deps.people,
          scopes: deps.dataScopes,
          clock: deps.clock,
        },
        callerDirectory: deps.callers,
      });
    },
  };
}
