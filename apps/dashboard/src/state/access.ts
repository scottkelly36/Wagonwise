import type { Privilege, StaffAccountDto } from '@wagonwise/contracts/staff';

/** WagonWise staff: every company, and the admin pages. */
export function isPlatform(staff: StaffAccountDto | undefined): boolean {
  return staff?.kind === 'platform';
}

/** Whether to offer something needing `privilege`. WagonWise staff hold everything. Only for
 *  what the screen shows: core checks every request itself. */
export function holds(staff: StaffAccountDto | undefined, privilege: Privilege): boolean {
  if (staff === undefined) return false;
  return staff.kind === 'platform' || staff.privileges.includes(privilege);
}
