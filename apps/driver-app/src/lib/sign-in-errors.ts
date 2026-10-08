import { ApiError } from '../api/errors';

export const REQUEST_OTP_MESSAGES: Record<string, string> = {
  InvalidIdentifier: 'Enter a valid email address or phone number.',
  InviteCodeRequired: "You'll need an invite code the first time you sign in.",
  InvalidInviteCode: "That invite code isn't recognised.",
  CodeNotSent:
    "We couldn't send your sign-in code. Try again in a minute. If it keeps happening, let your company or WagonWise know.",
};

export const VERIFY_OTP_MESSAGES: Record<string, string> = {
  ...REQUEST_OTP_MESSAGES,
  OtpNotFound: 'Request a new code.',
  OtpAlreadyConsumed: "That code's already been used — request a new one.",
  OtpExpired: "That code's expired — request a new one.",
  TooManyAttempts: 'Too many attempts. Request a new code.',
};

/**
 * What to tell a driver when sign-in fails. A named problem gets its own sentence; otherwise it says
 * what kind of failure it was, so a driver knows whether to retype something, wait, or ask for help,
 * rather than the same "something went wrong" for all of them.
 */
export function signInErrorMessage(error: unknown, messages: Record<string, string>): string {
  if (!(error instanceof ApiError)) {
    return "Couldn't reach the server. Check your connection.";
  }
  if (error.tag === 'OtpIncorrect') {
    const remaining = error.attemptsRemaining;
    return remaining === undefined
      ? 'Wrong code.'
      : `Wrong code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`;
  }
  const named = messages[error.tag];
  if (named !== undefined) return named;
  if (error.status === 429) return 'Too many tries. Wait a minute, then try again.';
  if (error.status >= 500) {
    return "We couldn't do that just now, and it isn't something you did. Try again in a minute, and if it keeps happening let us know.";
  }
  if (error.status === 400) {
    return 'Check the details you typed, with no extra spaces or characters, then try again.';
  }
  return 'Something went wrong. Try again.';
}
