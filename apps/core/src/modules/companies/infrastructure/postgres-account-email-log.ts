import { sql } from 'kysely';
import type { AccountEmailLog, AccountEmailRecord } from '../application/ports/account-emails.js';
import type { AccountEmailKind } from '../domain/account-emails.js';
import type { CompanyId } from '../domain/company.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` queries (decision 26). WagonWise staff only: the table has a platform-only policy, so run it in a platform scope. */
export class PostgresAccountEmailLog implements AccountEmailLog {
  constructor(private readonly db: UntypedDb) {}

  async claim(
    companyId: CompanyId,
    kind: AccountEmailKind,
    periodKey: string,
    at: Date,
  ): Promise<boolean> {
    const { rows } = await sql<{ company_id: string }>`
      insert into companies.account_email_log (company_id, kind, period_key, sent_at)
      values (${companyId}, ${kind}, ${periodKey}, ${at})
      on conflict do nothing
      returning company_id
    `.execute(this.db);
    return rows.length === 1;
  }

  async list(companyId: CompanyId, limit: number): Promise<readonly AccountEmailRecord[]> {
    const { rows } = await sql<{
      kind: AccountEmailKind;
      period_key: string;
      sent_at: Date;
      recipients: number;
    }>`
      select kind, period_key, sent_at, recipients from companies.account_email_log
      where company_id = ${companyId} order by sent_at desc limit ${limit}
    `.execute(this.db);
    return rows.map((r) => ({
      kind: r.kind,
      periodKey: r.period_key,
      sentAt: r.sent_at,
      recipients: r.recipients,
    }));
  }

  async release(companyId: CompanyId, kind: AccountEmailKind, periodKey: string): Promise<void> {
    await sql`
      delete from companies.account_email_log
      where company_id = ${companyId} and kind = ${kind} and period_key = ${periodKey}
    `.execute(this.db);
  }

  async recordSent(
    companyId: CompanyId,
    kind: AccountEmailKind,
    periodKey: string,
    recipients: number,
  ): Promise<void> {
    await sql`
      update companies.account_email_log set recipients = ${recipients}
      where company_id = ${companyId} and kind = ${kind} and period_key = ${periodKey}
    `.execute(this.db);
  }
}
