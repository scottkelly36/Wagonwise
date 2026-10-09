import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { Channel } from '../../domain/reminders.js';
import type { Mailer, PreferenceRepository, ReminderLog } from '../ports/reminders.js';

export class InMemoryPreferenceRepository implements PreferenceRepository {
  readonly #byStaff = new Map<StaffId, { companyId: CompanyId; channel: Channel }>();

  get(staffId: StaffId): Promise<Channel | undefined> {
    return Promise.resolve(this.#byStaff.get(staffId)?.channel);
  }

  listForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, Channel>> {
    return Promise.resolve(
      new Map(
        [...this.#byStaff.entries()]
          .filter(([, v]) => v.companyId === companyId)
          .map(([id, v]) => [id, v.channel] as const),
      ),
    );
  }

  save(staffId: StaffId, companyId: CompanyId, channel: Channel, _at?: Date): Promise<void> {
    this.#byStaff.set(staffId, { companyId, channel });
    return Promise.resolve();
  }
}

export class InMemoryReminderLog implements ReminderLog {
  readonly #claimed = new Set<string>();

  claim(staffId: StaffId, _companyId: CompanyId, day: DayString): Promise<boolean> {
    const key = `${staffId}/${day}`;
    if (this.#claimed.has(key)) return Promise.resolve(false);
    this.#claimed.add(key);
    return Promise.resolve(true);
  }

  release(staffId: StaffId, day: DayString): Promise<void> {
    this.#claimed.delete(`${staffId}/${day}`);
    return Promise.resolve();
  }
}

/** Records what would have been sent. `failFor` makes sending to that address fail. */
export class RecordingMailer implements Mailer {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  readonly failFor = new Set<string>();

  send(to: string, subject: string, text: string): Promise<void> {
    if (this.failFor.has(to)) return Promise.reject(new Error('mail provider said no'));
    this.sent.push({ to, subject, text });
    return Promise.resolve();
  }
}
