import type { CompanyId } from '../../domain/company.js';
import type { StaffAuditEntry } from '../../domain/staff-audit.js';

/** Append-only: there is deliberately no way to change or delete an entry (and the database
 *  role can't either, migration 0022). */
export interface StaffAuditLog {
  record(entry: StaffAuditEntry): Promise<void>;
  /** Newest first. No `companyId`: every company's entries and WagonWise staff's own. */
  recent(input: {
    readonly companyId?: CompanyId | undefined;
    readonly limit: number;
  }): Promise<StaffAuditEntry[]>;
}
