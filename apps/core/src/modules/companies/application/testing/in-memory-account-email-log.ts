import type { AccountEmailKind } from '../../domain/account-emails.js';
import type { CompanyId } from '../../domain/company.js';
import type { AccountEmailLog } from '../ports/account-emails.js';

export class InMemoryAccountEmailLog implements AccountEmailLog {
  readonly rows = new Map<string, { at: Date; recipients: number }>();

  private key(companyId: CompanyId, kind: AccountEmailKind, periodKey: string): string {
    return `${companyId}|${kind}|${periodKey}`;
  }

  claim(companyId: CompanyId, kind: AccountEmailKind, periodKey: string, at: Date) {
    const key = this.key(companyId, kind, periodKey);
    if (this.rows.has(key)) return Promise.resolve(false);
    this.rows.set(key, { at, recipients: 0 });
    return Promise.resolve(true);
  }

  list(companyId: CompanyId, limit: number) {
    const found = [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${companyId}|`))
      .map(([key, row]) => {
        const [, kind, periodKey] = key.split('|') as [string, AccountEmailKind, string];
        return { kind, periodKey, sentAt: row.at, recipients: row.recipients };
      })
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    return Promise.resolve(found.slice(0, limit));
  }

  release(companyId: CompanyId, kind: AccountEmailKind, periodKey: string) {
    this.rows.delete(this.key(companyId, kind, periodKey));
    return Promise.resolve();
  }

  recordSent(companyId: CompanyId, kind: AccountEmailKind, periodKey: string, recipients: number) {
    const row = this.rows.get(this.key(companyId, kind, periodKey));
    if (row !== undefined) row.recipients = recipients;
    return Promise.resolve();
  }
}
