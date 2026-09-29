import type { AdminDirectory } from '../ports/admin-directory.js';
import type { StaffId } from '../../domain/staff-account.js';

/** A deterministic `AdminDirectory` test double. Defaults to "nobody's an admin", the safer
 *  default for a route test that isn't specifically exercising the admin gate. */
export class StubAdminDirectory implements AdminDirectory {
  constructor(private readonly adminStaffIds: ReadonlySet<StaffId> = new Set()) {}

  isAdmin(staffId: StaffId): Promise<boolean> {
    return Promise.resolve(this.adminStaffIds.has(staffId));
  }
}
