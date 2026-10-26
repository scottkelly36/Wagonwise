import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { buildOverview, ukDay, type CompanyId, type StaffId } from '../domain/maintenance.js';
import {
  buildReminder,
  buildTextReminder,
  DEFAULT_CHANNEL,
  DEFAULT_COMPANY_CHANNEL,
  FIRST_REMINDER_HOUR,
  needsReminder,
  normaliseUkMobile,
  REMINDER_TEXTS_PER_MONTH,
  ukHour,
  ukMonth,
  type Channel,
  type CompanyChannel,
} from '../domain/reminders.js';
import type { Forbidden } from './item-types.js';
import type { StaffCaller, VehicleDirectory } from './ports/directories.js';
import type { ItemTypeRepository } from './ports/item-type-repository.js';
import type {
  Mailer,
  PreferenceRepository,
  ReminderLog,
  ReminderSettingsRepository,
  TextCounter,
  Texter,
} from './ports/reminders.js';
import { err as failWith, type TaggedError } from '../../../shared/result.js';
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
  /** How each company's reminders go (email, text or both). Absent, or a company with no choice: email. */
  readonly settings?: ReminderSettingsRepository | undefined;
  /** Texts sent this month, for the monthly limit. Texts need this and `texter`. */
  readonly texts?: TextCounter | undefined;
  /** Sends a text. Absent, or not available (no text account set up): everything goes by email. */
  readonly texter?: Texter | undefined;
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
  /** People reminded, by whichever channel. */
  readonly sent: number;
  readonly failed: number;
  /** Of those, how many texts were sent (a person told by both counts once in `sent` and once here). */
  readonly texts?: number;
}

/**
 * The morning reminder. For each company with something overdue or due soon, each person with `manage_maintenance` who
 * has not chosen portal-only is reminded once, from 7am UK time and no sooner: by email, or by a short text, or both, as the
 * company chooses. A text goes to the mobile the person added; with none, or once the company has had its monthly limit of
 * texts, or if the text fails, they get the email instead, so nobody is missed. A person's day is claimed before the email
 * goes and given back if it fails, so nobody gets two in a day and a failure is tried again on the next pass. Safe to run
 * as often as you like (it is run hourly).
 */
export async function sendDueReminders(
  deps: ReminderDeps,
  companies: readonly ReminderCompany[],
): Promise<ReminderOutcome> {
  const now = deps.clock.now();
  if (ukHour(now) < FIRST_REMINDER_HOUR) return { sent: 0, failed: 0, texts: 0 };
  const today = ukDay(now);

  const texter = deps.texter?.available === true ? deps.texter : undefined;
  const month = ukMonth(now);
  let sent = 0;
  let failed = 0;
  let texts = 0;
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
    const companyChannel = (await deps.settings?.getChannel(company.id)) ?? DEFAULT_COMPANY_CHANNEL;
    const mayText =
      texter !== undefined &&
      deps.texts !== undefined &&
      (companyChannel === 'text' || companyChannel === 'both');
    const mobiles = mayText ? await deps.preferences.listMobilesForCompany(company.id) : new Map();
    let textsThisMonth =
      mayText && deps.texts ? await deps.texts.sentInMonth(company.id, month) : 0;

    for (const person of bookers) {
      if ((choices.get(person.staffId) ?? DEFAULT_CHANNEL) !== 'email') continue;
      if (!(await deps.log.claim(person.staffId, company.id, today, now))) continue;
      const reminder = buildReminder({
        name: person.name,
        companyName: company.name,
        rows,
        dashboardUrl: deps.dashboardUrl,
      });
      const shortText = buildTextReminder({ companyName: company.name, rows });
      if (reminder === undefined || shortText === undefined) {
        await deps.log.release(person.staffId, today);
        continue;
      }

      let textSent = false;
      const mobile = mobiles.get(person.staffId);
      if (
        mayText &&
        texter !== undefined &&
        deps.texts !== undefined &&
        mobile !== undefined &&
        textsThisMonth < REMINDER_TEXTS_PER_MONTH
      ) {
        try {
          await texter.send(mobile, shortText);
          textSent = true;
          textsThisMonth += 1;
          texts += 1;
          await deps.texts.add(company.id, month, 1);
        } catch {
          // Falls back to the email below.
        }
      }

      const needsEmail = companyChannel !== 'text' || !textSent;
      if (!needsEmail) {
        sent += 1;
        continue;
      }
      try {
        await deps.mailer.send(person.email, reminder.subject, reminder.text);
        sent += 1;
      } catch {
        if (textSent) {
          // The text got there, so they have been told; the failed email is not tried again today.
          sent += 1;
        } else {
          await deps.log.release(person.staffId, today);
          failed += 1;
        }
      }
    }
  }
  return { sent, failed, texts };
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

export interface InvalidMobile extends TaggedError<'InvalidMobile'> {
  readonly reason: 'not_a_uk_mobile';
}

/** A person's own mobile for reminder texts: what is saved (+447700900123), or nothing. */
export async function getMyMobile(
  deps: Pick<ReminderDeps, 'preferences'>,
  caller: StaffCaller,
  staffId: StaffId,
): Promise<Result<string | undefined, Forbidden>> {
  if (bookerOwnCompany(caller) === undefined) return err({ tag: 'Forbidden' });
  return ok(await deps.preferences.getMobile(staffId));
}

/**
 * Adds, changes or removes the person's own mobile. A UK mobile typed any usual way is saved as +447700900123; an empty text
 * removes it; anything else is refused. Only used for reminder texts, and only if the company chooses texts.
 */
export async function setMyMobile(
  deps: Pick<ReminderDeps, 'preferences' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  raw: string,
): Promise<Result<string | undefined, Forbidden | InvalidMobile>> {
  const companyId = bookerOwnCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  const trimmed = raw.trim();
  if (trimmed === '') {
    await deps.preferences.saveMobile(staffId, companyId, undefined, deps.clock.now());
    return ok(undefined);
  }
  const mobile = normaliseUkMobile(trimmed);
  if (mobile === undefined) return failWith({ tag: 'InvalidMobile', reason: 'not_a_uk_mobile' });
  await deps.preferences.saveMobile(staffId, companyId, mobile, deps.clock.now());
  return ok(mobile);
}

export interface ReminderSettings {
  readonly channel: CompanyChannel;
  /** Whether a text account is set up, so text and both can work. */
  readonly textsAvailable: boolean;
  readonly textsThisMonth: number;
  readonly textLimit: number;
}

/** Someone who can book maintenance (or WagonWise staff) may see and change how their company is reminded. */
function mayManageReminders(caller: StaffCaller, companyId: CompanyId): boolean {
  if (caller.kind === 'platform') return true;
  return caller.companyId === companyId && caller.privileges.includes('manage_maintenance');
}

export async function getReminderSettings(
  deps: Pick<ReminderDeps, 'settings' | 'texts' | 'texter' | 'clock'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<ReminderSettings, Forbidden>> {
  if (!mayManageReminders(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok({
    channel: (await deps.settings?.getChannel(companyId)) ?? DEFAULT_COMPANY_CHANNEL,
    textsAvailable: deps.texter?.available === true,
    textsThisMonth: deps.texts
      ? await deps.texts.sentInMonth(companyId, ukMonth(deps.clock.now()))
      : 0,
    textLimit: REMINDER_TEXTS_PER_MONTH,
  });
}

export async function setReminderChannel(
  deps: Pick<ReminderDeps, 'settings' | 'texts' | 'texter' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  channel: CompanyChannel,
): Promise<Result<ReminderSettings, Forbidden>> {
  if (!mayManageReminders(caller, companyId) || deps.settings === undefined) {
    return err({ tag: 'Forbidden' });
  }
  await deps.settings.saveChannel(companyId, channel, staffId, deps.clock.now());
  return getReminderSettings(deps, caller, companyId);
}
