import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  revokeStaffSession,
  rotateStaffSession,
  type StaffRefreshTokenInvalid,
  type StaffRefreshTokenReused,
  type StaffSessionExpired,
  type StaffSessionRevoked,
} from '../domain/staff-session.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

export type StaffSessionNotFound = TaggedError<'StaffSessionNotFound'>;

/**
 * Swaps a refresh token for a new pair. A replayed refresh token revokes the session outright
 * (someone else has it). A removed account's sessions stop working at once, even if the refresh
 * token is otherwise fine.
 */
export async function refreshStaffSession(
  deps: Pick<StaffDeps, 'accounts' | 'sessions' | 'randomCodes' | 'tokenIssuer' | 'clock'>,
  input: { readonly refreshToken: string },
): Promise<
  Result<
    { readonly accessToken: string; readonly refreshToken: string },
    | StaffSessionNotFound
    | StaffSessionRevoked
    | StaffSessionExpired
    | StaffRefreshTokenReused
    | StaffRefreshTokenInvalid
  >
> {
  const presentedHash = sha256Hex(input.refreshToken);
  const session = await deps.sessions.findByRefreshTokenHash(presentedHash);
  if (!session) return err({ tag: 'StaffSessionNotFound' });

  const now = deps.clock.now();
  const account = await deps.accounts.findById(session.staffId);
  if (!account) {
    await deps.sessions.save(revokeStaffSession(session, now));
    return err({ tag: 'StaffSessionRevoked' });
  }

  const refreshToken = deps.randomCodes.refreshToken();
  const rotated = rotateStaffSession(session, presentedHash, sha256Hex(refreshToken), now);
  if (!rotated.ok) {
    if (rotated.error.tag === 'StaffRefreshTokenReused') {
      await deps.sessions.save(revokeStaffSession(session, now));
    }
    return rotated;
  }
  await deps.sessions.save(rotated.value);
  const accessToken = await deps.tokenIssuer.issue(account, session.id);
  return ok({ accessToken, refreshToken });
}

/** Signing out: this browser's session only. */
export async function signOutStaff(
  deps: Pick<StaffDeps, 'sessions' | 'clock'>,
  input: { readonly refreshToken: string },
): Promise<void> {
  const session = await deps.sessions.findByRefreshTokenHash(sha256Hex(input.refreshToken));
  if (session) await deps.sessions.save(revokeStaffSession(session, deps.clock.now()));
}
