import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory, VehicleDirectory } from './application/ports/directories.js';
import type { Mailer } from './application/ports/reminders.js';
import type { DefectDirectory } from './application/ports/repairs.js';
import {
  sendDueReminders,
  type ReminderCompany,
  type ReminderOutcome,
} from './application/reminders.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresItemTypeRepository } from './infrastructure/postgres-item-type-repository.js';
import {
  PostgresPreferenceRepository,
  PostgresReminderLog,
} from './infrastructure/postgres-reminders.js';
import { PostgresRepairRepository } from './infrastructure/postgres-repair-repository.js';
import { PostgresScheduleRepository } from './infrastructure/postgres-schedule-repository.js';
import { registerMaintenanceRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type {
  CallerDirectory,
  StaffCaller,
  VehicleDirectory,
} from './application/ports/directories.js';
export type { Mailer } from './application/ports/reminders.js';
export type { DefectDirectory, DefectInfo } from './application/ports/repairs.js';
export type { Recipient, ReminderCompany, ReminderOutcome } from './application/reminders.js';

export interface MaintenanceModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The company's vehicles, with their registrations. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleDirectory;
  /** Sends a plain-text email. Supplied by composition over `identity`. */
  readonly mailer: Mailer;
  /** Defects found by the walk-round checks, to book repairs for. Supplied by composition over `checks`. */
  readonly defects: DefectDirectory;
  /** The portal's address, for the link in reminder emails; none if it is not known. */
  readonly dashboardUrl: string | undefined;
}

export interface MaintenanceModule {
  registerRoutes(app: FastifyInstance): void;
  /**
   * The morning reminder: emails each person who books vehicles in, once a day from 7am UK time, when something is
   * overdue or due soon. Run hourly. The people to tell are passed in, gathered by composition beforehand, because this
   * runs in one data scope and scopes cannot nest. Returns how many went and how many failed, for the log.
   */
  sendDueReminders(companies: readonly ReminderCompany[]): Promise<ReminderOutcome>;
}

/**
 * `maintenance`'s only public surface (AGENTS.md rule 6): the things that fall due on a company's vehicles (MOT,
 * safety inspections, service...), which the firm names itself, when each is next due on each vehicle, and the
 * morning reminder.
 */
export function createMaintenanceModule(deps: MaintenanceModuleDeps): MaintenanceModule {
  const items = new PostgresItemTypeRepository(deps.db);
  const schedules = new PostgresScheduleRepository(deps.db);
  const preferences = new PostgresPreferenceRepository(deps.db);
  const log = new PostgresReminderLog(deps.db);
  const repairs = new PostgresRepairRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerMaintenanceRoutes(app, {
        items: { items, vehicles: deps.vehicles, clock: deps.clock },
        schedule: {
          items,
          schedules,
          vehicles: deps.vehicles,
          ids: deps.ids,
          clock: deps.clock,
        },
        reminders: { preferences, clock: deps.clock },
        repairs: { repairs, defects: deps.defects, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
    sendDueReminders(companies) {
      // Platform scope: it reads every company's dates and the day log.
      return deps.dataScopes.run({ kind: 'platform' }, () =>
        sendDueReminders(
          {
            items,
            schedules,
            vehicles: deps.vehicles,
            preferences,
            log,
            mailer: deps.mailer,
            clock: deps.clock,
            dashboardUrl: deps.dashboardUrl,
          },
          companies,
        ),
      );
    },
  };
}
