import { ApiError } from '../../api/errors';

/** Plain-English text for the staff routes' error tags (core's `staff-error-mapping.ts`). */
const MESSAGES: Record<string, string> = {
  InvalidCredentials: "That email and password don't match.",
  InvalidCode: "That code isn't right. Check it and try again.",
  ChallengeNotUsable: 'That sign-in has expired or had too many tries. Please start again.',
  EnrolmentNotUsable: 'That set-up has expired or had too many tries. Open your invite link again.',
  InviteNotUsable: 'This invite link has expired or has already been used.',
  EmailAlreadyInUse: 'There is already an account with that email address.',
  LastManager: 'A company needs at least one person who can manage users.',
  PrivilegeNotHeld: 'You can only give privileges you have yourself.',
  NotAFleetUser: 'WagonWise staff accounts have no per-company privileges.',
  Forbidden: "You're not allowed to do that.",
  StaffNotFound: 'That person could not be found.',
  CodeNotSent: "We couldn't send the code just now. Please try again.",
  NotSignedIn: 'Please sign in again.',
  RefreshTokenInvalid: 'Your session has ended. Please sign in again.',
};

export function staffErrorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return MESSAGES[error.tag] ?? `Something went wrong (${error.tag}).`;
  return 'Something went wrong. Please try again.';
}
