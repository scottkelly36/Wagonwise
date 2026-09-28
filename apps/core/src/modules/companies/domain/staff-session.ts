import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { StaffId } from './staff-account.js';

export type StaffSessionId = Id<'StaffSessionId'>;

/**
 * One browser's ongoing staff sign-in. Same rotation and reuse-detection shape as identity's
 * driver sessions (hashes only, the previous hash kept to spot a replayed refresh token), but
 * its own type: modules don't share domain code (AGENTS.md rule 6). The rotate/revoke rules
 * arrive with the sign-in use cases (P2-M1.5).
 */
export interface StaffSession {
  readonly id: StaffSessionId;
  readonly staffId: StaffId;
  readonly refreshTokenHash: string;
  readonly previousRefreshTokenHash: string | null;
  readonly issuedAt: Date;
  readonly lastUsedAt: Date;
  readonly refreshExpiresAt: Date;
  readonly revokedAt: Date | null;
}

export type StaffSessionRevoked = TaggedError<'StaffSessionRevoked'>;
export type StaffSessionExpired = TaggedError<'StaffSessionExpired'>;
export type StaffRefreshTokenReused = TaggedError<'StaffRefreshTokenReused'>;
export type StaffRefreshTokenInvalid = TaggedError<'StaffRefreshTokenInvalid'>;

/**
 * 7 days, sliding on each refresh: an office user who uses the dashboard every working day
 * never has to sign in again, but a week away means password and second factor again. Shorter
 * than drivers' 60 days because staff accounts can do much more (P2-M1.5 decision).
 */
export const STAFF_REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function newStaffSession(
  id: StaffSessionId,
  staffId: StaffId,
  refreshTokenHash: string,
  now: Date,
): StaffSession {
  return {
    id,
    staffId,
    refreshTokenHash,
    previousRefreshTokenHash: null,
    issuedAt: now,
    lastUsedAt: now,
    refreshExpiresAt: new Date(now.getTime() + STAFF_REFRESH_LIFETIME_MS),
    revokedAt: null,
  };
}

export function revokeStaffSession(session: StaffSession, now: Date): StaffSession {
  return session.revokedAt === null ? { ...session, revokedAt: now } : session;
}

/**
 * Same rules as identity's driver sessions: the current hash rotates forward; the previous hash
 * means a refresh token was replayed (the caller must revoke the session); anything else is
 * invalid.
 */
export function rotateStaffSession(
  session: StaffSession,
  presentedHash: string,
  newHash: string,
  now: Date,
): Result<
  StaffSession,
  StaffSessionRevoked | StaffSessionExpired | StaffRefreshTokenReused | StaffRefreshTokenInvalid
> {
  if (session.revokedAt !== null) return err({ tag: 'StaffSessionRevoked' });
  if (session.refreshExpiresAt.getTime() <= now.getTime()) {
    return err({ tag: 'StaffSessionExpired' });
  }
  if (presentedHash === session.refreshTokenHash) {
    return ok({
      ...session,
      refreshTokenHash: newHash,
      previousRefreshTokenHash: session.refreshTokenHash,
      lastUsedAt: now,
      refreshExpiresAt: new Date(now.getTime() + STAFF_REFRESH_LIFETIME_MS),
    });
  }
  if (presentedHash === session.previousRefreshTokenHash) {
    return err({ tag: 'StaffRefreshTokenReused' });
  }
  return err({ tag: 'StaffRefreshTokenInvalid' });
}
