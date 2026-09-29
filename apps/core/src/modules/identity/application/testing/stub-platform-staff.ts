import type { PlatformStaffDirectory, StaffId } from '../ports/platform-staff.js';

/** Says yes for the given staff ids and no for everyone else. */
export class StubPlatformStaff implements PlatformStaffDirectory {
  constructor(private readonly platformStaffIds: ReadonlySet<StaffId> = new Set()) {}

  isPlatformStaff(staffId: StaffId): Promise<boolean> {
    return Promise.resolve(this.platformStaffIds.has(staffId));
  }
}
