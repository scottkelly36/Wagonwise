import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { Channel, CompanyChannel } from '../../domain/reminders.js';

export interface PreferenceRepository {
  /** A person's own choice, or `undefined` if they have never made one (the default applies). */
  get(staffId: StaffId): Promise<Channel | undefined>;
  /** Every choice made by people in the company. */
  listForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, Channel>>;
  save(staffId: StaffId, companyId: CompanyId, channel: Channel, at: Date): Promise<void>;
  /** A person's own mobile (+447700900123), or `undefined` if they have not added one. */
  getMobile(staffId: StaffId): Promise<string | undefined>;
  /** Every mobile added by people in the company. */
  listMobilesForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, string>>;
  /** Adds, changes or (with `undefined`) removes a person's mobile, leaving their email choice as it is. */
  saveMobile(
    staffId: StaffId,
    companyId: CompanyId,
    mobile: string | undefined,
    at: Date,
  ): Promise<void>;
}

/** How a company's reminders go. */
export interface ReminderSettingsRepository {
  /** The company's choice, or `undefined` if it has never chosen (then email). */
  getChannel(companyId: CompanyId): Promise<CompanyChannel | undefined>;
  saveChannel(companyId: CompanyId, channel: CompanyChannel, by: StaffId, at: Date): Promise<void>;
}

/** Texts sent for a company in a month, for its monthly limit. */
export interface TextCounter {
  sentInMonth(companyId: CompanyId, month: string): Promise<number>;
  add(companyId: CompanyId, month: string, count: number): Promise<void>;
}

/** Sends one text message. Supplied by composition over identity's `sendText` (AGENTS.md rule 7). */
export interface Texter {
  /** Whether texts really go out. When false nothing is sent by text and every reminder goes by email. */
  readonly available: boolean;
  send(to: string, text: string): Promise<void>;
}

/** One reminder per person per day. */
export interface ReminderLog {
  /** Takes the day for this person: `true` if it was free, `false` if a reminder was already claimed for them today. */
  claim(staffId: StaffId, companyId: CompanyId, day: DayString, at: Date): Promise<boolean>;
  /** Gives the day back, when the email could not be sent, so the next pass tries again. */
  release(staffId: StaffId, day: DayString): Promise<void>;
}

/** Sends a plain-text email. Supplied by composition over identity's `sendEmail` (AGENTS.md rule 7). */
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}
