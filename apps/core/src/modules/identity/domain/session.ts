import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId } from './driver.js';

export type SessionId = Id<'SessionId'>;

/**
 * One device's ongoing sign-in (design doc §9). `refreshTokenHash` is the currently valid
 * refresh token's hash (sha256 hex, never the raw token); `previousRefreshTokenHash` is the
 * immediately-prior one, kept only long enough to recognise a replay of a token that was already
 * rotated away — decision 1: "a second use of a rotated token revokes the whole session chain."
 */
export interface Session {
  readonly id: SessionId;
  readonly driverId: DriverId;
  readonly refreshTokenHash: string;
  readonly previousRefreshTokenHash: string | null;
  readonly issuedAt: Date;
  readonly lastUsedAt: Date;
  /** Sliding window: pushed forward by REFRESH_LIFETIME_MS on every successful rotate(), so a
   *  driver who keeps using the app never has to re-enter an OTP; 60-90 days of inactivity does
   *  expire it (design doc §9). */
  readonly refreshExpiresAt: Date;
  readonly revokedAt: Date | null;
}

export type SessionRevoked = TaggedError<'SessionRevoked'>;
export type SessionExpired = TaggedError<'SessionExpired'>;
export type RefreshTokenReused = TaggedError<'RefreshTokenReused'>;
export type RefreshTokenInvalid = TaggedError<'RefreshTokenInvalid'>;

/** 60 days — the low end of "60-90 days" (design doc §9), sliding on each rotation. */
export const REFRESH_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;

export function isRevoked(session: Session): boolean {
  return session.revokedAt !== null;
}

export function revoke(session: Session, now: Date): Session {
  return { ...session, revokedAt: now };
}

/**
 * The refresh flow's only decision point. Matching the current hash rotates forward. Matching
 * the previous hash means the current token was already spent once to rotate — a replay, so this
 * reports `RefreshTokenReused` rather than quietly rejecting; the use case must revoke the whole
 * session on this outcome (revoking is not done here — this function only decides, it does not
 * decide *that* the session must die, which is a use-case-level consequence of the decision).
 * Anything else (already revoked, or a hash matching neither) is a plain invalid-token error.
 */
export function rotate(
  session: Session,
  presentedHash: string,
  newHash: string,
  now: Date,
): Result<Session, SessionRevoked | SessionExpired | RefreshTokenReused | RefreshTokenInvalid> {
  if (isRevoked(session)) {
    return err({ tag: 'SessionRevoked' });
  }
  if (session.refreshExpiresAt.getTime() <= now.getTime()) {
    return err({ tag: 'SessionExpired' });
  }
  if (presentedHash === session.refreshTokenHash) {
    return ok({
      ...session,
      refreshTokenHash: newHash,
      previousRefreshTokenHash: session.refreshTokenHash,
      lastUsedAt: now,
      refreshExpiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
    });
  }
  if (
    session.previousRefreshTokenHash !== null &&
    presentedHash === session.previousRefreshTokenHash
  ) {
    return err({ tag: 'RefreshTokenReused' });
  }
  return err({ tag: 'RefreshTokenInvalid' });
}
