import type { GiveConsentError } from '../application/give-consent.js';
import type { RegisterDeviceError } from '../application/register-device.js';
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
  | GiveConsentError;

/**
 * Tag -> HTTP status, in exactly one table (AGENTS.md rule 13). `switch-exhaustiveness-check`
 * means a new domain error tag breaks compilation here instead of silently becoming a 500.
 */
export function statusFor(error: IdentityError): number {
  switch (error.tag) {
    case 'InvalidIdentifier':
    case 'InviteCodeRequired':
    case 'InvalidInviteCode':
    case 'InvalidPushToken':
      return 400;
    case 'OtpNotFound':
    case 'SessionNotFound':
    case 'DriverNotFound':
      return 404;
    case 'OtpAlreadyConsumed':
      return 409;
    case 'OtpExpired':
      return 410;
    case 'OtpIncorrect':
    case 'SessionRevoked':
    case 'SessionExpired':
    case 'RefreshTokenReused':
    case 'RefreshTokenInvalid':
      return 401;
    case 'TooManyAttempts':
      return 429;
  }
}
