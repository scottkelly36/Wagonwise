import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../../shared/ports/unit-of-work.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { Driver } from '../domain/driver.js';
import { identifierForms, type InvalidIdentifier } from '../domain/identifier.js';
import {
  verify as verifyOtpCode,
  type OtpAlreadyConsumed,
  type OtpExpired,
  type OtpIncorrect,
  type TooManyAttempts,
} from '../domain/otp.js';
import { createDriver } from './create-driver.js';
import type { InvalidInviteCode, InviteCodeRequired, PasswordRequired } from './errors.js';
import { sha256Hex } from './hash.js';
import { issueSession } from './issue-session.js';
import type { CredentialRepository } from './ports/credential-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { TokenSigner } from './ports/token-signer.js';

export type OtpNotFound = TaggedError<'OtpNotFound'>;

export interface VerifyOtpDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly credentialRepo: CredentialRepository;
  readonly otpRepo: OtpRepository;
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly unitOfWork: UnitOfWork;
  /** `DRIVER_INVITE_REQUIRED`: false lets a new driver in with no code. */
  readonly inviteRequired: boolean;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface VerifyOtpInput {
  readonly identifier: string;
  readonly code: string;
  /** Required only when no Driver exists yet for this identifier (first sign-in). `| undefined`
   *  (not just optional) so a zod-parsed body — whose `.optional()` types the key exactly this
   *  way — is assignable under exactOptionalPropertyTypes without a cast at the call site. */
  readonly inviteCode?: string | undefined;
}

export interface VerifyOtpResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly driver: Driver;
}

export type VerifyOtpError =
  | InvalidIdentifier
  | OtpNotFound
  | OtpExpired
  | OtpAlreadyConsumed
  | OtpIncorrect
  | TooManyAttempts
  | InviteCodeRequired
  | InvalidInviteCode
  | PasswordRequired;

/**
 * Confirms a code, creating the Driver (redeeming the invite code atomically via UnitOfWork,
 * decision 4) on a first sign-in, and issues a session: an access token plus a refresh token.
 *
 * A driver who has a password is refused (`PasswordRequired`): their way in is the password and then a code (`password-accounts.ts`),
 * or a code alone would walk round the password.
 */
export async function verifyOtp(
  deps: VerifyOtpDeps,
  input: VerifyOtpInput,
): Promise<Result<VerifyOtpResult, VerifyOtpError>> {
  const forms = identifierForms(input.identifier);
  if (!forms.ok) {
    return forms;
  }
  // Found under whichever form it is stored in (see requestOtp), so the code asked for and the code checked share a key.
  let driver = await deps.driverRepo.findByAnyIdentifier(forms.value);
  if (driver && (await deps.credentialRepo.findByDriverId(driver.id))) {
    return err({ tag: 'PasswordRequired' });
  }
  const identifier = driver?.identifier ?? forms.value[0];
  const now = deps.clock.now();

  const otp = await deps.otpRepo.findLatestFor(identifier);
  if (!otp) {
    return err({ tag: 'OtpNotFound' });
  }
  const { outcome, next } = verifyOtpCode(otp, sha256Hex(input.code), now);
  await deps.otpRepo.save(identifier, next); // always persist — a wrong guess still counts
  if (!outcome.ok) {
    return outcome;
  }

  if (!driver) {
    const created = await createDriver(deps, { identifier, inviteCode: input.inviteCode, now });
    if (!created.ok) {
      return created;
    }
    driver = created.value;
  }

  const session = await issueSession(deps, driver, now);
  return ok({ ...session, driver });
}
