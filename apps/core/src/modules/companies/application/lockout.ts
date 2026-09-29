import { STAFF_LOCKOUT_WINDOW_MS, isLockedOut } from '../domain/staff-lockout.js';
import type { StaffId } from '../domain/staff-account.js';
import type { StaffDeps } from './staff-deps.js';

/** Too many recent failures for this account (`domain/staff-lockout.ts`)? */
export async function isAccountLockedOut(
  deps: Pick<StaffDeps, 'auditLog' | 'clock'>,
  staffId: StaffId,
): Promise<boolean> {
  const since = new Date(deps.clock.now().getTime() - STAFF_LOCKOUT_WINDOW_MS);
  const [passwordFailures, codeFailures] = await Promise.all([
    deps.auditLog.countSince({ targetId: staffId, action: 'sign_in_failed', since }),
    deps.auditLog.countSince({ targetId: staffId, action: 'second_factor_failed', since }),
  ]);
  return isLockedOut({ passwordFailures, codeFailures });
}
