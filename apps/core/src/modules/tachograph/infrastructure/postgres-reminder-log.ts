import { sql } from 'kysely';
import type { ReminderClaim, ReminderLog } from '../application/ports.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every repository here (decision 26). Needs the platform data scope, which sees every company's rows. */
export class PostgresReminderLog implements ReminderLog {
  constructor(private readonly db: UntypedDb) {}

  async claim(claim: ReminderClaim, at: Date): Promise<boolean> {
    const { rows } = await sql`
      insert into tachograph.reminder_log (company_id, kind, subject_id, downloaded_on, stage, sent_at)
      values (${claim.companyId}, ${claim.kind}, ${claim.subjectId}, ${claim.downloadedOn}::date, ${claim.stage}, ${at})
      on conflict do nothing
      returning stage
    `.execute(this.db);
    return rows.length > 0;
  }

  async release(claims: readonly ReminderClaim[]): Promise<void> {
    for (const claim of claims) {
      await sql`
        delete from tachograph.reminder_log
        where company_id = ${claim.companyId} and kind = ${claim.kind} and subject_id = ${claim.subjectId}
          and downloaded_on = ${claim.downloadedOn}::date and stage = ${claim.stage}
      `.execute(this.db);
    }
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const { rows } = await sql`
      delete from tachograph.reminder_log where sent_at < ${before} returning stage
    `.execute(this.db);
    return rows.length;
  }
}
