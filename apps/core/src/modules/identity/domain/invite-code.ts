import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId } from './driver.js';

/**
 * Tester access for Phase 1 (design doc §9): a driver signing in for the first time needs one
 * of these, redeemed atomically with creating their Driver (application/verify-otp.ts) so an
 * abandoned sign-in never burns a code.
 */
export interface InviteCode {
  readonly code: string; // the code itself is the identity — no separate id
  readonly redeemedBy: DriverId | null;
  readonly redeemedAt: Date | null;
  readonly createdAt: Date;
}

export type InviteCodeAlreadyRedeemed = TaggedError<'InviteCodeAlreadyRedeemed'>;

export function isRedeemed(invite: InviteCode): boolean {
  return invite.redeemedBy !== null;
}

/** Redeeming is the only way an InviteCode changes. Pure: no I/O, no clock read. */
export function redeem(
  invite: InviteCode,
  driverId: DriverId,
  now: Date,
): Result<InviteCode, InviteCodeAlreadyRedeemed> {
  if (isRedeemed(invite)) {
    return err({ tag: 'InviteCodeAlreadyRedeemed' });
  }
  return ok({ ...invite, redeemedBy: driverId, redeemedAt: now });
}
