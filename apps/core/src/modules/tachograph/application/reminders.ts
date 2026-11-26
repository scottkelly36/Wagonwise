import { downloadStatus } from '@wagonwise/contracts/tachograph';
import type { Clock } from '../../../shared/ports/clock.js';
import {
  driverPush,
  FIRST_REMINDER_HOUR,
  officeEmail,
  reminderStage,
  type DueItem,
  type NamedItem,
} from '../domain/reminders.js';
import type { CompanyId, StaffId } from '../domain/tachograph.js';
import type {
  DriverPusher,
  FileRepository,
  Mailer,
  ReminderClaim,
  ReminderDirectory,
  ReminderLog,
  SettingsRepository,
} from './ports.js';

/** A person who may be emailed: a live fleet account, with what it may do. */
export interface Recipient {
  readonly staffId: StaffId;
  readonly name: string;
  readonly email: string;
  readonly privileges: readonly string[];
}

/** A company and the people to tell. Gathered before the run, because the run works in one data scope. */
export interface ReminderCompany {
  readonly id: CompanyId;
  readonly name: string;
  readonly recipients: readonly Recipient[];
}

export interface ReminderDeps {
  readonly settings: SettingsRepository;
  readonly files: FileRepository;
  readonly log: ReminderLog;
  readonly directory: ReminderDirectory;
  readonly pusher: DriverPusher;
  readonly mailer: Mailer;
  readonly clock: Clock;
  /** The portal's address, for the link in the email. */
  readonly dashboardUrl: string | undefined;
}

export interface ReminderOutcome {
  /** Emails sent to the office. */
  readonly emailed: number;
  /** Pushes accepted by a driver's phone. */
  readonly pushed: number;
  readonly failed: number;
}

/** The UK calendar day. */
export function ukDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);
}

/** The hour in UK time (0 to 23). */
export function ukHour(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    hour12: false,
  }).format(at);
  return Number(hour) % 24;
}

/** What is to be sent for one company, after the reminders are recorded. */
export interface CompanyPlan {
  readonly company: ReminderCompany;
  readonly items: readonly DueItem[];
  /** Whether a driver who sends files is pushed about their own card. */
  readonly pushDrivers: boolean;
}

/**
 * Works out what is coming due and records each reminder so it goes once. Needs one data scope over every company (the platform
 * scope), so it only touches the database. A firm that has turned reminders off, and a driver card or vehicle unit with no file
 * yet (nothing to count from), are left out.
 */
export async function planReminders(
  deps: Pick<ReminderDeps, 'settings' | 'files' | 'log' | 'clock'>,
  companies: readonly ReminderCompany[],
): Promise<CompanyPlan[]> {
  const now = deps.clock.now();
  if (ukHour(now) < FIRST_REMINDER_HOUR) return [];
  const today = ukDay(now);
  const plans: CompanyPlan[] = [];
  for (const company of companies) {
    const settings = await deps.settings.get(company.id);
    if (!settings.remindersEnabled) continue;
    const items: DueItem[] = [];
    for (const file of await deps.files.latestPerSubject(company.id)) {
      const status = downloadStatus(file.kind, file.downloadedOn, today);
      const stage = reminderStage(status);
      const subjectId = file.kind === 'driver_card' ? file.driverId : file.vehicleId;
      if (stage === undefined || subjectId === undefined || status.dueOn === undefined) continue;
      const claimed = await deps.log.claim(
        {
          companyId: company.id,
          kind: file.kind,
          subjectId,
          downloadedOn: file.downloadedOn,
          stage,
        },
        now,
      );
      if (!claimed) continue;
      items.push({
        kind: file.kind,
        subjectId,
        downloadedOn: file.downloadedOn,
        stage,
        dueOn: status.dueOn,
        daysLeft: status.daysLeft ?? 0,
      });
    }
    if (items.length > 0) plans.push({ company, items, pushDrivers: settings.driversMaySend });
  }
  return plans;
}

const claimOf = (companyId: CompanyId, item: DueItem): ReminderClaim => ({
  companyId,
  kind: item.kind,
  subjectId: item.subjectId,
  downloadedOn: item.downloadedOn,
  stage: item.stage,
});

/**
 * Sends the planned reminders: a push to each driver about their own card (when the firm lets drivers send files), and one email to
 * each person who manages the fleet listing everything due. Does not touch the database in its own scope. Returns the claims to give
 * back: those of a company where someone could be told and nobody was, so the next pass tries again.
 */
export async function deliverReminders(
  deps: Pick<ReminderDeps, 'directory' | 'pusher' | 'mailer' | 'dashboardUrl'>,
  plans: readonly CompanyPlan[],
): Promise<{ outcome: ReminderOutcome; release: ReminderClaim[] }> {
  let emailed = 0;
  let pushed = 0;
  let failed = 0;
  const release: ReminderClaim[] = [];
  for (const plan of plans) {
    const { company } = plan;
    let reachable = 0;
    let reached = 0;

    if (plan.pushDrivers) {
      for (const item of plan.items.filter((i) => i.kind === 'driver_card')) {
        try {
          const sent = await deps.pusher.push(item.subjectId, driverPush(item));
          // A driver with no phone registered cannot be told, so there is nothing to try again.
          if (sent.devices > 0) reachable++;
          if (sent.accepted > 0) {
            pushed++;
            reached++;
          }
        } catch {
          reachable++;
          failed++;
        }
      }
    }

    const managers = company.recipients.filter((r) => r.privileges.includes('manage_fleet'));
    if (managers.length > 0) {
      const named: NamedItem[] = [];
      for (const item of plan.items) {
        named.push({
          ...item,
          name:
            item.kind === 'driver_card'
              ? await deps.directory.driverName(item.subjectId)
              : await deps.directory.vehicleName(company.id, item.subjectId),
        });
      }
      for (const person of managers) {
        reachable++;
        const email = officeEmail({
          personName: person.name,
          companyName: company.name,
          items: named,
          dashboardUrl: deps.dashboardUrl,
        });
        try {
          await deps.mailer.send(person.email, email.subject, email.text);
          emailed++;
          reached++;
        } catch {
          failed++;
        }
      }
    }

    // Someone could have been told and no one was: give the claims back so the next pass tries again. If no one can be told at
    // all (no manager, no phone), keep them, or every pass would try for nothing.
    if (reachable > 0 && reached === 0) {
      release.push(...plan.items.map((i) => claimOf(company.id, i)));
    }
  }
  return { outcome: { emailed, pushed, failed }, release };
}
