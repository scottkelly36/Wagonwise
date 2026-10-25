import type { FastifyInstance } from 'fastify';
import { makeId } from '../../shared/brand.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import { pruneClosedSos, type MailDeps, type SosDeps } from './application/sos.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverSituations,
  Mailer,
  OfficeContacts,
  WordsFor,
} from './application/ports.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresSosRepository } from './infrastructure/postgres-sos-repository.js';
import { registerSosRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  DriverIdentityDirectory,
  DriverSituation,
  DriverSituations,
  Mailer,
  OfficeContact,
  OfficeContacts,
  StaffCaller,
  WordsFor,
} from './application/ports.js';

export interface SosModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** A driver's sign-in, for the `driver` data scope. Supplied by composition over `identity`. */
  readonly driverIdentities: DriverIdentityDirectory;
  /** Who a driver is and which companies an SOS goes to. Supplied by composition over identity, fleet and jobs. */
  readonly situations: DriverSituations;
  /** The three words for a position. Supplied by composition over what3words. */
  readonly words: WordsFor;
  /** Who to email at a company. Supplied by composition over companies. */
  readonly contacts: OfficeContacts;
  readonly mailer: Mailer;
  /** The portal's address, for the link in the email. */
  readonly portalUrl?: string | undefined;
  /** Test hook: how long to wait for the three words. */
  readonly wordsTimeoutMs?: number | undefined;
}

export interface SosModule {
  registerRoutes(app: FastifyInstance): void;
  /** Deletes resolved and cancelled alerts older than `retentionDays`; says how many went. A platform-wide housekeeping job. */
  pruneClosed(retentionDays: number): Promise<number>;
  /** Removes everything held about a deleted driver. Safe to run twice. Supplied to `identity`'s eraser by composition. */
  eraseDriverData(driverId: string): Promise<void>;
}

/**
 * `sos`' only public surface (AGENTS.md rule 6): a driver presses and holds SOS and the companies they drive for are told where
 * they are, by email and in the portal. WagonWise does not contact the emergency services, and says so to the driver.
 */
export function createSosModule(deps: SosModuleDeps): SosModule {
  const repo = new PostgresSosRepository(deps.db);
  const sos: SosDeps = {
    repo,
    situations: deps.situations,
    words: deps.words,
    ids: deps.ids,
    clock: deps.clock,
    wordsTimeoutMs: deps.wordsTimeoutMs,
  };
  const mail: MailDeps = {
    contacts: deps.contacts,
    mailer: deps.mailer,
    portalUrl: deps.portalUrl,
  };
  return {
    pruneClosed: (retentionDays) =>
      deps.dataScopes.run({ kind: 'platform' }, () => pruneClosedSos(sos, retentionDays)),
    eraseDriverData: (driverId) =>
      deps.dataScopes.run({ kind: 'platform' }, () =>
        repo.eraseDriver(makeId<'DriverId'>(driverId)),
      ),
    registerRoutes(app: FastifyInstance): void {
      registerSosRoutes(app, {
        sos,
        mail,
        callerDirectory: deps.callers,
        identities: deps.driverIdentities,
        dataScopes: deps.dataScopes,
      });
    },
  };
}
