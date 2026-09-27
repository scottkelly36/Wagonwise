import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdentityModule } from '../identity/api.js';
import { IdentityAdminDirectory } from './infrastructure/identity-admin-directory.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCompanyRepository } from './infrastructure/postgres-company-repository.js';
import { registerCompaniesRoutes, type CompaniesRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface CompaniesModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  /** The one cross-context read every companies route's admin gate needs (AGENTS.md rule 7) —
   *  companies never imports identity's `Driver`/`DriverId` directly, just this one method,
   *  wrapped by `infrastructure/identity-admin-directory.ts`. */
  readonly identity: Pick<IdentityModule, 'isDriverAdmin'>;
}

export interface CompaniesModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `companies`'s only public surface (AGENTS.md rule 6). Everything under `domain/`,
 * `application/`, `infrastructure/` and `interface/` is reachable only through here — same
 * pattern as every other module. Phase 1 of the business-facing dashboard (2026-09-27): just
 * enough backend for an admin to create and list companies, and (via identity's own
 * `updateDriver`) assign a driver to one. No read-model exposed to any other module yet — nothing
 * outside `companies` and `identity` needs to know a company exists.
 */
export function createCompaniesModule(deps: CompaniesModuleDeps): CompaniesModule {
  const repo = new PostgresCompanyRepository(deps.db);
  const adminDirectory = new IdentityAdminDirectory(deps.identity);

  const routeDeps: CompaniesRouteDeps = {
    createCompany: { repo, clock: deps.clock },
    companyRepo: repo,
    adminDirectory,
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerCompaniesRoutes(app, routeDeps);
    },
  };
}
