import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type {
  CallerDirectory,
  CompanyAccounts,
  CompanyRoster,
  DriverCompanies,
  DriverIdentityDirectory,
} from './application/ports.js';
import { pruneExpired, type TachographDeps } from './application/tachograph.js';
import type { UntypedDb } from './infrastructure/db.js';
import {
  PostgresFileRepository,
  PostgresSettingsRepository,
} from './infrastructure/postgres-tachograph-repositories.js';
import { registerTachographRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  CompanyAccounts,
  CompanyRoster,
  DriverCompanies,
  DriverIdentityDirectory,
  StaffCaller,
} from './application/ports.js';

export interface TachographModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A driver's own identifier, for the `driver` data scope. Supplied by composition over `identity`. */
  readonly driverIdentities: DriverIdentityDirectory;
  /** The companies a driver is an active member of. Supplied by composition over `fleet`. */
  readonly driverCompanies: DriverCompanies;
  /** A company's drivers and vehicles. Supplied by composition over `fleet`. */
  readonly roster: CompanyRoster;
  /** Whether a company's account is paused. Supplied by composition over `companies`. */
  readonly companyAccounts?: CompanyAccounts | undefined;
}

export interface TachographModule {
  /** Deletes files past each firm's retention (never under 12 months); says how many went. Runs in the platform data scope. */
  pruneExpiredFiles(): Promise<number>;
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `tachograph`'s only public surface (AGENTS.md rule 6): copies of driver card and vehicle unit downloads, kept unaltered for the
 * firm, with the dates the portal's download tracker works from. Nothing is read out of a file.
 */
export function createTachographModule(deps: TachographModuleDeps): TachographModule {
  const tachograph: TachographDeps = {
    settings: new PostgresSettingsRepository(deps.db),
    files: new PostgresFileRepository(deps.db),
    companies: deps.driverCompanies,
    roster: deps.roster,
    accounts: deps.companyAccounts,
    ids: deps.ids,
    clock: deps.clock,
  };
  return {
    pruneExpiredFiles: () =>
      deps.dataScopes.run({ kind: 'platform' }, () => pruneExpired(tachograph)),
    registerRoutes(app: FastifyInstance): void {
      registerTachographRoutes(app, {
        tachograph,
        callerDirectory: deps.callers,
        driverIdentities: deps.driverIdentities,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
