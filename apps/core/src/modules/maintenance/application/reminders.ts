import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { buildOverview, ukDay, type CompanyId, type StaffId } from '../domain/maintenance.js';
import {
  buildReminder,
  DEFAULT_CHANNEL,
  FIRST_REMINDER_HOUR,
  needsReminder,
  ukHour,
  type Channel,
} from '../domain/reminders.js';
import type { Forbidden } from './item-types.js';
import type { StaffCaller, VehicleDirectory } from './ports/directories.js';
import type { ItemTypeRepository } from './ports/item-type-repository.js';
import type { Mailer, PreferenceRepository, ReminderLog } from './ports/reminders.js';
import type { ScheduleRepository } from './ports/schedule-repository.js';

export interface ReminderDeps {
  readonly items: ItemTypeRepository;
  readonly schedules: ScheduleRepository;
  readonly vehicles: VehicleDirectory;
  readonly preferences: PreferenceRepository;
  readonly log: ReminderLog;
  readonly mailer: Mailer;
  readonly clock: Clock;
  /** The portal's address, for the link in the email; none if it is not known. */
  readonly dashboardUrl: string | undefined;
}

/** A person who might be sent a reminder: a live fleet account, with what it may do. */
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

/** Only those given `manage_maintenance` are told; they are the ones who can act on it. */
const isBooker = (r: Recipient): boolean => r.privileges.includes('manage_maintenance');

export interface ReminderOutcome {
  readonly sent: number;
  readonly failed: number;
}

/**
 * The morning reminder. For each company with something overdue or due soon, each person with `manage_maintenance` who
 * has not chosen portal-only is emailed once, from 7am UK time and no sooner. A person's day is claimed before the email
 * goes and given back if it fails, so nobody gets two in a day and a failure is tried again on the next pass. Safe to run
 * as often as you like (it is run hourly).
 */
export async function sendDueReminders(
  deps: ReminderDeps,
  companies: readonly ReminderCompany[],
): Promise<ReminderOutcome> {
  const now = deps.clock.now();
  if (ukHour(now) < FIRST_REMINDER_HOUR) return { sent: 0, failed: 0 };
  const today = ukDay(now);

  let sent = 0;
  let failed = 0;
  for (const company of companies) {
    const bookers = company.recipients.filter(isBooker);
    if (bookers.length === 0) continue;

    const [itemTypes, vehicles, schedules] = await Promise.all([
      deps.items.listForCompany(company.id),
      deps.vehicles.listForCompany(company.id),
      deps.schedules.listForCompany(company.id),
    ]);
    const rows = buildOverview({ itemTypes, vehicles, schedules, today }).filter(needsReminder);
    if (rows.length === 0) continue;

    const choices = await deps.preferences.listForCompany(company.id);
    for (const person of bookers) {
      if ((choices.get(person.staffId) ?? DEFAULT_CHANNEL) !== 'email') continue;
      if (!(await deps.log.claim(person.staffId, company.id, today, now))) continue;
      const reminder = buildReminder({
        name: person.name,
        companyName: company.name,
        rows,
        dashboardUrl: deps.dashboardUrl,
      });
      if (reminder === undefined) {
        await deps.log.release(person.staffId, today);
        continue;
      }
      try {
        await deps.mailer.send(person.email, reminder.subject, reminder.text);
        sent += 1;
      } catch {
        await deps.log.release(person.staffId, today);
        failed += 1;
      }
    }
  }
  return { sent, failed };
}

/** A person may see and change their own reminders only if they keep the dates: it is for those who book. */
function bookerOwnCompany(caller: StaffCaller): CompanyId | undefined {
  return caller.kind === 'fleet' && caller.privileges.includes('manage_maintenance')
    ? caller.companyId
    : undefined;
}

/** How this person is told: their choice, or email if they have never chosen. */
export async function getMyReminders(
  deps: Pick<ReminderDeps, 'preferences'>,
  caller: StaffCaller,
  staffId: StaffId,
): Promise<Result<Channel, Forbidden>> {
  if (bookerOwnCompany(caller) === undefined) return err({ tag: 'Forbidden' });
  return ok((await deps.preferences.get(staffId)) ?? DEFAULT_CHANNEL);
}

export async function setMyReminders(
  deps: Pick<ReminderDeps, 'preferences' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  channel: Channel,
): Promise<Result<Channel, Forbidden>> {
  const companyId = bookerOwnCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  await deps.preferences.save(staffId, companyId, channel, deps.clock.now());
  return ok(channel);
}
