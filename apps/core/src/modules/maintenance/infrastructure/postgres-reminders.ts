import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { PreferenceRepository, ReminderLog } from '../application/ports/reminders.js';
import type { CompanyId, DayString, StaffId } from '../domain/maintenance.js';
import type { Channel } from '../domain/reminders.js';
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
