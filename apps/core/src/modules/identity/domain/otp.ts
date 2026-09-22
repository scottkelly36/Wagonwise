import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

/**
 * A one-time code sent to a driver's identifier at sign-in. `codeHash` is sha256 of the code,
 * never the raw digits — matches identity.sessions storing refresh tokens hashed, never raw.
 * Has no `identifier` field: the repository looks it up scoped by identifier, so nothing here
 * needs to carry it back around.
 */
export interface Otp {
  readonly id: string; // opaque, repository-assigned
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly attempts: number;
}

export type OtpExpired = TaggedError<'OtpExpired'>;
export type OtpAlreadyConsumed = TaggedError<'OtpAlreadyConsumed'>;
export interface OtpIncorrect extends TaggedError<'OtpIncorrect'> {
  readonly attemptsRemaining: number;
}
export type TooManyAttempts = TaggedError<'TooManyAttempts'>;

export const MAX_OTP_ATTEMPTS = 5;

export interface OtpVerification {
  readonly outcome: Result<Otp, OtpExpired | OtpAlreadyConsumed | OtpIncorrect | TooManyAttempts>;
  /** What to persist either way — a wrong guess still increments `attempts`; that's the point. */
  readonly next: Otp;
}

/**
 * Checking a presented code against a stored one. Pure: the caller supplies `presentedHash`
 * (hashed the same way `codeHash` was) and `now`. Always returns both the verdict and the state
 * to persist, because a failed attempt is itself a state change (rate-limiting guesses) — the use
 * case has exactly one thing to save regardless of outcome.
 */
export function verify(otp: Otp, presentedHash: string, now: Date): OtpVerification {
  if (otp.consumedAt !== null) {
    return { outcome: err({ tag: 'OtpAlreadyConsumed' }), next: otp };
  }
  if (otp.expiresAt.getTime() <= now.getTime()) {
    return { outcome: err({ tag: 'OtpExpired' }), next: otp };
  }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { outcome: err({ tag: 'TooManyAttempts' }), next: otp };
  }
  if (presentedHash !== otp.codeHash) {
    const next = { ...otp, attempts: otp.attempts + 1 };
    return {
      outcome: err({ tag: 'OtpIncorrect', attemptsRemaining: MAX_OTP_ATTEMPTS - next.attempts }),
      next,
    };
  }
  const next = { ...otp, consumedAt: now };
  return { outcome: ok(next), next };
}
