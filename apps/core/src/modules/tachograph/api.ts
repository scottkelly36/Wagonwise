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
  DriverPusher,
  Mailer,
  ReminderDirectory,
} from './application/ports.js';
import {
  deliverReminders,
  planReminders,
  type ReminderCompany,
  type ReminderOutcome,
} from './application/reminders.js';
import { pruneExpired, type TachographDeps } from './application/tachograph.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresReminderLog } from './infrastructure/postgres-reminder-log.js';
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
  DriverPusher,
  Mailer,
  ReminderDirectory,
  StaffCaller,
} from './application/ports.js';
export type { ReminderCompany, ReminderOutcome } from './application/reminders.js';
export { ExpoDriverPusher, type DriverDevices } from './infrastructure/expo-driver-pusher.js';

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
  /** For the due-download reminders: names for the email, a push to a driver's phones, and the email. Without them none are sent. */
  readonly reminders?:
    | {
        readonly directory: ReminderDirectory;
        readonly pusher: DriverPusher;
        readonly mailer: Mailer;
        /** The portal's address, for the link in the email. */
        readonly dashboardUrl: string | undefined;
      }
    | undefined;
}

export interface TachographModule {
  /** Deletes files past each firm's retention (never under 12 months); says how many went. Runs in the platform data scope. */
  pruneExpiredFiles(): Promise<number>;
  /**
   * Tells the office, and drivers who send files, about downloads coming due or overdue, once each. Safe to run as often as you like
   * (it is run hourly, and sends from 7am UK). The people to email are passed in because the run works in one data scope. Opens its
   * own platform data scope, so call it outside any other `DataScopes.run`.
   */
  sendDueReminders(companies: readonly ReminderCompany[]): Promise<ReminderOutcome>;
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `tachograph`'s only public surface (AGENTS.md rule 6): copies of driver card and vehicle unit downloads, kept unaltered for the
 * firm, with the dates the portal's download tracker works from, and reminders when one is coming due. From a driver card file only the card's number, holder and expiry and the period of its activity are read (never a reason to refuse it).
 */
export function createTachographModule(deps: TachographModuleDeps): TachographModule {
  const settings = new PostgresSettingsRepository(deps.db);
  const files = new PostgresFileRepository(deps.db);
  const log = new PostgresReminderLog(deps.db);
  const tachograph: TachographDeps = {
    settings,
    files,
    companies: deps.driverCompanies,
    roster: deps.roster,
    accounts: deps.companyAccounts,
    ids: deps.ids,
    clock: deps.clock,
  };
  return {
    pruneExpiredFiles: () =>
      deps.dataScopes.run({ kind: 'platform' }, async () => {
        // Reminder records older than a year are of no use: a download is never counted from that far back.
        await log.deleteOlderThan(new Date(deps.clock.now().getTime() - 366 * 86_400_000));
        return pruneExpired(tachograph);
      }),
    async sendDueReminders(companies) {
      const reminders = deps.reminders;
      if (reminders === undefined) return { emailed: 0, pushed: 0, failed: 0 };
      // Work out and record what is due inside one scope that sees every company; send outside it (the lookups for names and phones
      // open their own scopes); then give back the records of anything that could not be sent, in a scope again.
      const plans = await deps.dataScopes.run({ kind: 'platform' }, () =>
        planReminders({ settings, files, log, clock: deps.clock }, companies),
      );
      if (plans.length === 0) return { emailed: 0, pushed: 0, failed: 0 };
      const { outcome, release } = await deliverReminders(reminders, plans);
      if (release.length > 0) {
        await deps.dataScopes.run({ kind: 'platform' }, () => log.release(release));
      }
      return outcome;
    },
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
