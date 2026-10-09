import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { Channel } from '../../domain/reminders.js';

export interface PreferenceRepository {
  /** A person's own choice, or `undefined` if they have never made one (the default applies). */
  get(staffId: StaffId): Promise<Channel | undefined>;
  /** Every choice made by people in the company. */
  listForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, Channel>>;
  save(staffId: StaffId, companyId: CompanyId, channel: Channel, at: Date): Promise<void>;
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
