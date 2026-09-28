import type { Id } from '../../../shared/brand.js';
import type { SecondFactorMethod, StaffId } from './staff-account.js';
import type { StaffInviteId } from './staff-invite.js';

export type StaffChallengeId = Id<'StaffChallengeId'>;

/** 10 minutes to enter a code, and 5 tries, before starting again. */
export const STAFF_CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
export const STAFF_CHALLENGE_MAX_ATTEMPTS = 5;

interface ChallengeBase {
  readonly id: StaffChallengeId;
  readonly method: SecondFactorMethod;
  /** sha256 of a texted or emailed code; null for an authenticator app, which makes its own. */
  readonly codeHash: string | null;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

/** The password was right; the second-factor code is still owed. */
export interface SignInChallenge extends ChallengeBase {
  readonly purpose: 'sign-in';
  readonly staffId: StaffId;
}

/**
 * Someone accepting an invite has picked a password and a second factor. Their account is only
 * created once the first code proves the factor works; until then the credentials wait here.
 */
export interface EnrolmentChallenge extends ChallengeBase {
  readonly purpose: 'enrolment';
  readonly inviteId: StaffInviteId;
  readonly pendingPasswordHash: string;
  readonly pendingTotpSecretCiphertext: string | null;
  readonly pendingPhone: string | null;
}

export type StaffChallenge = SignInChallenge | EnrolmentChallenge;
