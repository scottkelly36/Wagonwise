import { ApiError } from '../../api/errors';
import { PostcodeNotFoundError } from '../../lib/postcodes';

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
  InvalidIdentifier: "That doesn't look like a phone number or email address.",
  AlreadyInvited: 'There is already a pending invitation for that phone number or email.',
  AlreadyLinked: 'That driver is already linked to this company.',
  LinkNotFound: 'That invitation or request could not be found.',
  InvalidLinkTransition: 'That has already been decided.',
  InvalidReference: 'Enter a job reference.',
  InvalidStops: 'A job needs at least one pickup and one delivery stop.',
  InvalidTransition: "That job can't move to that status right now.",
  JobNotFound: 'That job could not be found.',
  DriverNotInCompany: "That driver doesn't belong to this company.",
  VehicleNotInCompany: "That vehicle doesn't belong to this company.",
  DriverBusy: 'That driver is already on another active job.',
};

export function staffErrorMessage(error: unknown): string {
  // Core's per-account lockout (TooManyAttempts) and the staff BFF's per-address limit.
  if (error instanceof ApiError && error.status === 429) {
    return 'Too many attempts. Please wait 15 minutes, then try again.';
  }
  if (error instanceof PostcodeNotFoundError) {
    return `We can't find the postcode ${error.postcode}. Check it and try again.`;
  }
  if (error instanceof ApiError)
    return MESSAGES[error.tag] ?? `Something went wrong (${error.tag}).`;
  return 'Something went wrong. Please try again.';
}
