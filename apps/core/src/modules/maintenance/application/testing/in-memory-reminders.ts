import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { Channel, CompanyChannel } from '../../domain/reminders.js';
import type {
  Mailer,
  PreferenceRepository,
  ReminderLog,
  ReminderSettingsRepository,
  TextCounter,
  Texter,
} from '../ports/reminders.js';

export class InMemoryPreferenceRepository implements PreferenceRepository {
  readonly #byStaff = new Map<StaffId, { companyId: CompanyId; channel: Channel }>();
  readonly #mobiles = new Map<StaffId, { companyId: CompanyId; mobile: string }>();

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

  getMobile(staffId: StaffId): Promise<string | undefined> {
    return Promise.resolve(this.#mobiles.get(staffId)?.mobile);
  }

  listMobilesForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, string>> {
    return Promise.resolve(
      new Map(
        [...this.#mobiles.entries()]
          .filter(([, v]) => v.companyId === companyId)
          .map(([id, v]) => [id, v.mobile] as const),
      ),
    );
  }

  saveMobile(
    staffId: StaffId,
    companyId: CompanyId,
    mobile: string | undefined,
    _at?: Date,
  ): Promise<void> {
    if (mobile === undefined) this.#mobiles.delete(staffId);
    else this.#mobiles.set(staffId, { companyId, mobile });
    return Promise.resolve();
  }
}

export class InMemoryReminderSettings implements ReminderSettingsRepository {
  readonly #byCompany = new Map<CompanyId, CompanyChannel>();

  getChannel(companyId: CompanyId): Promise<CompanyChannel | undefined> {
    return Promise.resolve(this.#byCompany.get(companyId));
  }

  saveChannel(
    companyId: CompanyId,
    channel: CompanyChannel,
    _by?: StaffId,
    _at?: Date,
  ): Promise<void> {
    this.#byCompany.set(companyId, channel);
    return Promise.resolve();
  }
}

export class InMemoryTextCounter implements TextCounter {
  readonly #counts = new Map<string, number>();

  sentInMonth(companyId: CompanyId, month: string): Promise<number> {
    return Promise.resolve(this.#counts.get(`${companyId}/${month}`) ?? 0);
  }

  add(companyId: CompanyId, month: string, count: number): Promise<void> {
    const key = `${companyId}/${month}`;
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + count);
    return Promise.resolve();
  }
}

/** Records the texts that would have been sent. `failFor` makes sending to that number fail. */
export class RecordingTexter implements Texter {
  readonly sent: { to: string; text: string }[] = [];
  readonly failFor = new Set<string>();
  constructor(readonly available = true) {}

  send(to: string, text: string): Promise<void> {
    if (this.failFor.has(to)) return Promise.reject(new Error('text provider said no'));
    this.sent.push({ to, text });
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
