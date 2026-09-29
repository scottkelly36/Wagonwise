import type { CompanyId } from '../../domain/company.js';
import type { StaffId } from '../../domain/staff-account.js';
import type { StaffAuditAction, StaffAuditEntry } from '../../domain/staff-audit.js';

/** Append-only: there is deliberately no way to change or delete an entry (and the database
 *  role can't either, migration 0022). */
export interface StaffAuditLog {
  record(entry: StaffAuditEntry): Promise<void>;
  /** Newest first. No `companyId`: every company's entries and WagonWise staff's own. */
  recent(input: {
    readonly companyId?: CompanyId | undefined;
    readonly limit: number;
  }): Promise<StaffAuditEntry[]>;
  /** How many `action` entries concern `targetId` since `since`: the lockout counts (P2-M1.12). */
  countSince(input: {
    readonly targetId: StaffId;
    readonly action: StaffAuditAction;
    readonly since: Date;
  }): Promise<number>;
}
