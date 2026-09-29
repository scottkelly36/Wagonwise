import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor } from '../domain/staff-account.js';
import type { StaffAuditEntry } from '../domain/staff-audit.js';
import { canViewStaff, type Forbidden } from '../domain/staff-policy.js';
import type { StaffDeps } from './staff-deps.js';

/** The most recent entries shown at once. Enough for "what happened lately"; older ones stay in
 *  the table for investigations. */
export const STAFF_AUDIT_PAGE = 200;

/**
 * The audit log, newest first, with the same visibility as the users list: a company's managers
 * see their own company's entries; WagonWise admins see any company's, or everything (their own
 * staff's entries included) when no company is given.
 */
export async function listStaffAudit(
  deps: Pick<StaffDeps, 'auditLog'>,
  actor: Actor,
  input: { readonly companyId?: CompanyId | undefined },
): Promise<Result<StaffAuditEntry[], Forbidden>> {
  if (input.companyId === undefined) {
    if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  } else if (!canViewStaff(actor, input.companyId)) {
    return err({ tag: 'Forbidden' });
  }
  return ok(await deps.auditLog.recent({ companyId: input.companyId, limit: STAFF_AUDIT_PAGE }));
}
