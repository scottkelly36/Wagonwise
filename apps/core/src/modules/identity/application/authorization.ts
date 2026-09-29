import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { PlatformStaffDirectory, StaffId } from './ports/platform-staff.js';

/** The caller isn't allowed to do this. Mapped to 403 in `interface/error-mapping.ts`. */
export type Forbidden = TaggedError<'Forbidden'>;

/**
 * The driver-account and invite-code screens' rule: WagonWise admins only. Checked in the use
 * cases (P2-M1.8), so no caller of a use case can skip it. Since P2-M1.12c the caller is a
 * signed-in staff account, not a driver with an admin flag.
 */
export async function requirePlatformStaff(
  staff: PlatformStaffDirectory,
  callerId: StaffId,
): Promise<Result<void, Forbidden>> {
  return (await staff.isPlatformStaff(callerId)) ? ok(undefined) : err({ tag: 'Forbidden' });
}
