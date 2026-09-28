import { makeId } from '../../../shared/brand.js';
import type { StaffAccount } from '../domain/staff-account.js';
import { newStaffSession } from '../domain/staff-session.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

export interface StaffTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly staff: StaffAccount;
}

/** Starts a new session for a staff member who has just proved both factors. */
export async function issueStaffSession(
  deps: Pick<StaffDeps, 'sessions' | 'randomCodes' | 'tokenIssuer' | 'clock' | 'ids'>,
  staff: StaffAccount,
): Promise<StaffTokens> {
  const refreshToken = deps.randomCodes.refreshToken();
  const session = newStaffSession(
    makeId<'StaffSessionId'>(deps.ids.newId()),
    staff.id,
    sha256Hex(refreshToken),
    deps.clock.now(),
  );
  await deps.sessions.save(session);
  const accessToken = await deps.tokenIssuer.issue(staff, session.id);
  return { accessToken, refreshToken, staff };
}
