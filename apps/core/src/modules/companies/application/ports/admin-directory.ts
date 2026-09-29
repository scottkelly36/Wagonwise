import type { StaffId } from '../../domain/staff-account.js';

/** Is this staff member a WagonWise admin? The gate for the WagonWise-wide admin pages
 *  (P2-M1.12c: staff accounts, replacing the old driver `isAdmin` flag). */
export interface AdminDirectory {
  isAdmin(staffId: StaffId): Promise<boolean>;
}
