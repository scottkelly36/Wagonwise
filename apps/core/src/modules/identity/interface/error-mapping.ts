import type { Forbidden } from '../application/authorization.js';
import type {
  ConfirmPasswordResetError,
  ConfirmSignupError,
  PasswordSignInError,
  RequestPasswordResetError,
  RequestSignupCodeError,
  SetPasswordError,
  VerifyPasswordSignInError,
} from '../application/password-accounts.js';
import type { GiveConsentError } from '../application/give-consent.js';
import type { SetDriverNameError } from '../application/set-driver-name.js';
import type { RegisterDeviceError } from '../application/register-device.js';
import type {
  ConfirmEmailAdditionError,
  LinkSocialError,
  RequestEmailAdditionError,
} from '../application/account-links.js';
import type { SocialSignInError } from '../application/social-sign-in.js';
import type { RequestOtpError } from '../application/request-otp.js';
import type { RefreshTokenError } from '../application/refresh-token.js';
import type { SessionNotFound } from '../application/revoke-session.js';
import type { VerifyOtpError } from '../application/verify-otp.js';

export type IdentityError =
  | RequestOtpError
  | VerifyOtpError
  | RefreshTokenError
  | SessionNotFound
  | RegisterDeviceError
  | GiveConsentError
  | SetDriverNameError
  | Forbidden
  | RequestSignupCodeError
  | ConfirmSignupError
  | PasswordSignInError
  | VerifyPasswordSignInError
  | RequestPasswordResetError
  | ConfirmPasswordResetError
  | SetPasswordError
  | SocialSignInError
  | LinkSocialError
  | RequestEmailAdditionError
  | ConfirmEmailAdditionError;

/**
 * New in open sign-up (docs/driver-sign-in-plan.md): `DisposableEmail` and `UkMobileRequired` are 400 (the app words them itself); `TooManyCodes` is 429, which the
 * released app already shows as "wait a minute"; `SendsPaused` and `SignUpsPaused` (today's texts or new accounts used up) are 503, which it shows as "not something you did".
 *
 * Tag -> HTTP status, in exactly one table (AGENTS.md rule 13). `switch-exhaustiveness-check`
 * means a new domain error tag breaks compilation here instead of silently becoming a 500.
 */
export function statusFor(error: IdentityError): number {
  switch (error.tag) {
    case 'InvalidIdentifier':
    case 'InviteCodeRequired':
    case 'InvalidInviteCode':
    case 'InvalidPushToken':
    case 'NameTooLong':
    case 'EmailRequired':
    case 'PasswordTooShort':
    case 'PasswordTooLong':
    case 'PasswordIsEmail':
    case 'DisposableEmail':
    case 'UkMobileRequired':
      return 400;
    case 'OtpNotFound':
    case 'SessionNotFound':
    case 'DriverNotFound':
      return 404;
    case 'OtpAlreadyConsumed':
    case 'AccountExists':
    case 'AlreadyLinked':
    case 'EmailAlreadySet':
    case 'PasswordRequired':
    case 'PasswordAlreadySet':
      return 409;
    case 'OtpExpired':
      return 410;
    case 'OtpIncorrect':
    case 'InvalidIdToken':
    case 'InvalidCredentials':
    case 'SessionRevoked':
    case 'SessionExpired':
    case 'RefreshTokenReused':
    case 'RefreshTokenInvalid':
      return 401;
    case 'TooManyAttempts':
    case 'TooManyCodes':
      return 429;
    case 'CodeNotSent':
      return 502;
    case 'ProviderNotConfigured':
    case 'SendsPaused':
    case 'SignUpsPaused':
      return 503;
    case 'Forbidden':
    case 'EmailNotVerified':
      return 403;
  }
}
