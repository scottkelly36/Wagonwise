import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, type Result } from '../../../shared/result.js';
import { identifierForms, type InvalidIdentifier } from '../domain/identifier.js';
import { isRedeemed } from '../domain/invite-code.js';
import type {
  CodeNotSent,
  InvalidInviteCode,
  InviteCodeRequired,
  PasswordRequired,
} from './errors.js';
import { issueOtp, OTP_TTL_MS as ISSUED_OTP_TTL_MS } from './issue-otp.js';
import type { CredentialRepository } from './ports/credential-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { OtpCodeGenerator } from './ports/otp-code-generator.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { OtpSender } from './ports/otp-sender.js';

export interface RequestOtpDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly credentialRepo: CredentialRepository;
  readonly otpRepo: OtpRepository;
  readonly otpSender: OtpSender;
  readonly otpCodeGenerator: OtpCodeGenerator;
  /** `DRIVER_INVITE_REQUIRED`: false lets a new driver in with no code. */
  readonly inviteRequired: boolean;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RequestOtpInput {
  readonly identifier: string;
  /** Required only when no Driver exists yet for this identifier (first sign-in). `| undefined`
   *  (not just optional) so a zod-parsed body — whose `.optional()` types the key exactly this
   *  way — is assignable under exactOptionalPropertyTypes without a cast at the call site. */
  readonly inviteCode?: string | undefined;
}

export const OTP_TTL_MS = ISSUED_OTP_TTL_MS;

export type RequestOtpError =
  InvalidIdentifier | InviteCodeRequired | InvalidInviteCode | CodeNotSent | PasswordRequired;

/**
 * Sends a one-time code. For a new identifier, validates an invite code without redeeming it —
 * redemption happens atomically with actually creating the Driver, in verify-otp.ts, so an
 * abandoned request (never followed by verify) never burns a code.
 */
export async function requestOtp(
  deps: RequestOtpDeps,
  input: RequestOtpInput,
): Promise<Result<void, RequestOtpError>> {
  const forms = identifierForms(input.identifier);
  if (!forms.ok) {
    return forms;
  }
  // An account made before UK numbers were made consistent may be stored as 07… when the driver types +44…, or the other way
  // round: find it either way, and use the form it is stored under for the code, so sign-in finds the same code.
  const existingDriver = await deps.driverRepo.findByAnyIdentifier(forms.value);
  if (existingDriver && (await deps.credentialRepo.findByDriverId(existingDriver.id))) {
    return err({ tag: 'PasswordRequired' });
  }
  const identifier = existingDriver?.identifier ?? forms.value[0];
  if (!existingDriver && deps.inviteRequired) {
    if (!input.inviteCode) {
      return err({ tag: 'InviteCodeRequired' });
    }
    const invite = await deps.inviteCodeRepo.findByCode(input.inviteCode);
    if (!invite || isRedeemed(invite)) {
      return err({ tag: 'InvalidInviteCode' });
    }
  }

  return issueOtp(deps, identifier);
}
