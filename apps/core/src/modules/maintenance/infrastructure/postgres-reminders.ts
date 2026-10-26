import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type {
  PreferenceRepository,
  ReminderLog,
  ReminderSettingsRepository,
  TextCounter,
} from '../application/ports/reminders.js';
import type { CompanyId, DayString, StaffId } from '../domain/maintenance.js';
import type { Channel, CompanyChannel } from '../domain/reminders.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0051) limits a request to
 *  its own company's rows; the reminder run works in the platform scope. */
export class PostgresPreferenceRepository implements PreferenceRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(staffId: StaffId): Promise<Channel | undefined> {
    const { rows } = await sql<{ channel: Channel }>`
      select channel from maintenance.reminder_preferences where staff_id = ${staffId}
    `.execute(this.db);
    return rows[0]?.channel;
  }

  async listForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, Channel>> {
    const { rows } = await sql<{ staff_id: string; channel: Channel }>`
      select staff_id, channel from maintenance.reminder_preferences where company_id = ${companyId}
    `.execute(this.db);
    return new Map(rows.map((r) => [makeId<'StaffId'>(r.staff_id), r.channel] as const));
  }

  async save(staffId: StaffId, companyId: CompanyId, channel: Channel, at: Date): Promise<void> {
    await sql`
      insert into maintenance.reminder_preferences (staff_id, company_id, channel, updated_at)
      values (${staffId}, ${companyId}, ${channel}, ${at})
      on conflict (staff_id) do update set channel = excluded.channel, updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async getMobile(staffId: StaffId): Promise<string | undefined> {
    const { rows } = await sql<{ mobile: string | null }>`
      select mobile from maintenance.reminder_preferences where staff_id = ${staffId}
    `.execute(this.db);
    return rows[0]?.mobile ?? undefined;
  }

  async listMobilesForCompany(companyId: CompanyId): Promise<ReadonlyMap<StaffId, string>> {
    const { rows } = await sql<{ staff_id: string; mobile: string }>`
      select staff_id, mobile from maintenance.reminder_preferences
      where company_id = ${companyId} and mobile is not null
    `.execute(this.db);
    return new Map(rows.map((r) => [makeId<'StaffId'>(r.staff_id), r.mobile] as const));
  }

  async saveMobile(
    staffId: StaffId,
    companyId: CompanyId,
    mobile: string | undefined,
    at: Date,
  ): Promise<void> {
    // A person who has only added a mobile still has the default email choice.
    await sql`
      insert into maintenance.reminder_preferences (staff_id, company_id, channel, mobile, updated_at)
      values (${staffId}, ${companyId}, 'email', ${mobile ?? null}, ${at})
      on conflict (staff_id) do update set mobile = excluded.mobile, updated_at = excluded.updated_at
    `.execute(this.db);
  }
}

export class PostgresReminderSettings implements ReminderSettingsRepository {
  constructor(private readonly db: UntypedDb) {}

  async getChannel(companyId: CompanyId): Promise<CompanyChannel | undefined> {
    const { rows } = await sql<{ channel: CompanyChannel }>`
      select channel from maintenance.reminder_settings where company_id = ${companyId}
    `.execute(this.db);
    return rows[0]?.channel;
  }

  async saveChannel(
    companyId: CompanyId,
    channel: CompanyChannel,
    by: StaffId,
    at: Date,
  ): Promise<void> {
    await sql`
      insert into maintenance.reminder_settings (company_id, channel, updated_at, updated_by)
      values (${companyId}, ${channel}, ${at}, ${by})
      on conflict (company_id) do update
        set channel = excluded.channel, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }
}

export class PostgresTextCounter implements TextCounter {
  constructor(private readonly db: UntypedDb) {}

  async sentInMonth(companyId: CompanyId, month: string): Promise<number> {
    const { rows } = await sql<{ sent: number }>`
      select sent from maintenance.reminder_text_counts
      where company_id = ${companyId} and month = ${month}
    `.execute(this.db);
    return rows[0]?.sent ?? 0;
  }

  async add(companyId: CompanyId, month: string, count: number): Promise<void> {
    await sql`
      insert into maintenance.reminder_text_counts (company_id, month, sent)
      values (${companyId}, ${month}, ${count})
      on conflict (company_id, month) do update set sent = maintenance.reminder_text_counts.sent + excluded.sent
    `.execute(this.db);
  }
}

export class PostgresReminderLog implements ReminderLog {
  constructor(private readonly db: UntypedDb) {}

  async claim(staffId: StaffId, companyId: CompanyId, day: DayString, at: Date): Promise<boolean> {
    const { rows } = await sql<{ staff_id: string }>`
      insert into maintenance.reminder_log (staff_id, day, company_id, sent_at)
      values (${staffId}, ${day}::date, ${companyId}, ${at})
      on conflict (staff_id, day) do nothing
      returning staff_id
    `.execute(this.db);
    return rows.length === 1;
  }

  async release(staffId: StaffId, day: DayString): Promise<void> {
    await sql`
      delete from maintenance.reminder_log where staff_id = ${staffId} and day = ${day}::date
    `.execute(this.db);
  }
}
