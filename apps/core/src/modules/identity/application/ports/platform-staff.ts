import type { Id } from '../../../../shared/brand.js';

/** A staff account's id. Same brand name as the `companies` module's own (decision 46),
 *  declared here rather than imported. */
export type StaffId = Id<'StaffId'>;

/** Is this signed-in staff member a WagonWise admin (P2-M1.12c)? The driver-account and
 *  invite-code screens are WagonWise-only. Implemented by composition over `companies`'
 *  `getStaffCaller` (AGENTS.md rule 7: identity never imports `companies`). */
export interface PlatformStaffDirectory {
  isPlatformStaff(staffId: StaffId): Promise<boolean>;
}
