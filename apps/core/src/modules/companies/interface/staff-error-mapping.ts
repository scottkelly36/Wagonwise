/**
 * The one place a staff use case's error tag becomes an HTTP status (AGENTS.md rule 13).
 * Anything not listed is a bug, so it's a 500 via the error handler, not a guess here.
 */
const STATUS_BY_TAG: Record<string, number> = {
  InvalidCredentials: 401,
  InvalidCode: 401,
  TooManyAttempts: 429,
  ChallengeNotUsable: 410,
  EnrolmentNotUsable: 410,
  InviteNotUsable: 410,
  EmailAlreadyInUse: 409,
  CompanyNotFound: 404,
  InvalidSetting: 400,
  CodeNotSent: 502,
  StaffSessionNotFound: 401,
  StaffSessionRevoked: 401,
  StaffSessionExpired: 401,
  StaffRefreshTokenReused: 401,
  StaffRefreshTokenInvalid: 401,
  Forbidden: 403,
  PrivilegeNotHeld: 403,
  LastManager: 409,
  NotAFleetUser: 409,
  StaffNotFound: 404,
};

export function staffStatusFor(error: { readonly tag: string }): number {
  const status = STATUS_BY_TAG[error.tag];
  if (status === undefined) throw new Error(`no HTTP status mapped for staff error ${error.tag}`);
  return status;
}
