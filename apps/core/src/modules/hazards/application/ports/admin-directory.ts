import type { Id } from '../../../../shared/brand.js';

/** A staff account's id. Same brand name as the `companies` module's own (decision 46). */
export type StaffId = Id<'StaffId'>;

/** Is this signed-in staff member a WagonWise admin? The gate for browsing every report and for
 *  true deletes (P2-M1.12c: a staff account, replacing the old driver admin flag). Supplied by
 *  composition over `companies`' `getStaffCaller`; hazards never imports `companies`. */
export interface AdminDirectory {
  isAdmin(staffId: StaffId): Promise<boolean>;
}
