import { makeId } from '../../../shared/brand.js';
import type { StaffAccount } from '../domain/staff-account.js';
import type { StaffAuditAction, StaffAuditDetails } from '../domain/staff-audit.js';
import type { StaffDeps } from './staff-deps.js';

/** The company an account's entries are filed under: its own, or none for WagonWise staff. */
export function auditCompanyOf(account: StaffAccount) {
  return account.kind === 'fleet' ? account.companyId : undefined;
}

/**
 * Writes one audit entry, stamped now. Called inside the use case, so it lands in the same
 * transaction as the change it describes (the request's `DataScopes` transaction): a change
 * that commits always has its entry, and a rolled-back one never does.
 */
export async function audit(
  deps: Pick<StaffDeps, 'auditLog' | 'clock' | 'ids'>,
  entry: {
    readonly action: StaffAuditAction;
    readonly actorId?: StaffAccount['id'] | undefined;
    readonly companyId?: ReturnType<typeof auditCompanyOf>;
    readonly targetId?: StaffAccount['id'] | undefined;
    readonly details?: StaffAuditDetails;
  },
): Promise<void> {
  await deps.auditLog.record({
    id: makeId<'StaffAuditEntryId'>(deps.ids.newId()),
    at: deps.clock.now(),
    action: entry.action,
    actorId: entry.actorId,
    companyId: entry.companyId,
    targetId: entry.targetId,
    details: entry.details ?? {},
  });
}
