import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@wagonwise/contracts/identity';

import { ApiError } from '../api/errors';

export const REQUEST_OTP_MESSAGES: Record<string, string> = {
  InvalidIdentifier: 'Enter a valid email address or phone number.',
  InviteCodeRequired:
    "We can't find an account for that. If you've signed in before, try the email or number you used then. If it's your first time, enter your invite code.",
  InvalidInviteCode: "That invite code isn't recognised.",
  CodeNotSent:
    "We couldn't send your sign-in code. Try again in a minute. If it keeps happening, let your company or WagonWise know.",
  PasswordRequired:
    'This account has a password. Sign in with your email and password instead of a code.',
};

export const VERIFY_OTP_MESSAGES: Record<string, string> = {
  ...REQUEST_OTP_MESSAGES,
  OtpNotFound: 'Request a new code.',
  OtpAlreadyConsumed: "That code's already been used. Request a new one.",
  OtpExpired: "That code's expired. Request a new one.",
  TooManyAttempts: 'Too many attempts. Request a new code.',
};

// ---- Email and password sign-in (docs/driver-sign-in-plan.md) ----

const PASSWORD_MESSAGES: Record<string, string> = {
  PasswordTooShort: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
  PasswordTooLong: `Your password can be at most ${MAX_PASSWORD_LENGTH} characters.`,
  PasswordIsEmail: "Your password can't be the same as your email.",
  InvalidIdentifier: 'Enter a valid email address.',
  EmailRequired: 'Enter your email address.',
};

/** Step 1 of signing in with a password. One message whichever of the two was wrong, as the server gives. */
export const PASSWORD_SIGN_IN_MESSAGES: Record<string, string> = {
  InvalidCredentials: "That email or password isn't right.",
  TooManyAttempts: 'Too many wrong passwords. This account is locked for 15 minutes.',
  CodeNotSent: REQUEST_OTP_MESSAGES.CodeNotSent ?? '',
};

/** Signing up: asking for the code, then confirming it with the password. */
export const SIGN_UP_MESSAGES: Record<string, string> = {
  ...VERIFY_OTP_MESSAGES,
  ...PASSWORD_MESSAGES,
  InviteCodeRequired: 'Enter your invite code to sign up.',
  AccountExists:
    'There is already an account for that email. Go back and sign in, or use Forgot password.',
};

/** Forgot password: asking for the code, then the code with a new password. */
export const RESET_PASSWORD_MESSAGES: Record<string, string> = {
  ...VERIFY_OTP_MESSAGES,
  ...PASSWORD_MESSAGES,
  OtpNotFound: 'Ask for a new code first.',
};

/** Adding a password to an account that has none. */
export const SET_PASSWORD_MESSAGES: Record<string, string> = {
  ...PASSWORD_MESSAGES,
  PasswordAlreadySet:
    'You already have a password. To change it, sign out and use Forgot password.',
};

/** Adding an email to an account made with a phone number: asking for the code, then confirming it. */
export const ADD_EMAIL_MESSAGES: Record<string, string> = {
  ...VERIFY_OTP_MESSAGES,
  ...PASSWORD_MESSAGES,
  EmailAlreadySet: 'This account already has an email.',
  AccountExists: 'That email already belongs to another account.',
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
