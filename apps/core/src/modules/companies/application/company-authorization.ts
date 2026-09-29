import { err, ok, type Result } from '../../../shared/result.js';
import type { StaffId } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import type { AdminDirectory } from './ports/admin-directory.js';

/**
 * Who may create and list companies (P2-M1.8): WagonWise admins only. A company is business data
 * with no legitimate reason for anyone else to read or create one. Checked in the use cases, not
 * the routes, so no caller can skip it. Since P2-M1.12c the caller is a staff account;
 * only WagonWise (platform) staff pass.
 */
export async function requireCompanyAdmin(
  admins: AdminDirectory,
  callerId: StaffId,
): Promise<Result<void, Forbidden>> {
  return (await admins.isAdmin(callerId)) ? ok(undefined) : err({ tag: 'Forbidden' });
}
