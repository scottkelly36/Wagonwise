import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../../shared/ports/unit-of-work.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Driver, DriverId } from '../domain/driver.js';
import { identifierForms, type InvalidIdentifier } from '../domain/identifier.js';
import { isRedeemed } from '../domain/invite-code.js';
import {
  verify as verifyOtpCode,
  type OtpAlreadyConsumed,
  type OtpExpired,
  type OtpIncorrect,
  type TooManyAttempts,
} from '../domain/otp.js';
import {
  afterRightPassword,
  afterWrongPassword,
  emailIdentifier,
  isLockedOut,
  newCredential,
  validatePassword,
  type EmailRequired,
  type PasswordIsEmail,
  type PasswordTooLong,
  type PasswordTooShort,
} from '../domain/password.js';
import { createDriver } from './create-driver.js';
import type {
  AccountExists,
  CodeNotSent,
  DriverNotFound,
  InvalidCredentials,
  InvalidInviteCode,
  InviteCodeRequired,
  PasswordAlreadySet,
} from './errors.js';
import { sha256Hex } from './hash.js';
import { issueOtp } from './issue-otp.js';
import { issueSession, type IssuedSession } from './issue-session.js';
import type { CredentialRepository } from './ports/credential-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { OtpCodeGenerator } from './ports/otp-code-generator.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { OtpSender } from './ports/otp-sender.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { TokenSigner } from './ports/token-signer.js';
import type { OtpNotFound } from './verify-otp.js';

/**
 * Email-and-password accounts, with an emailed code as the second factor (docs/driver-sign-in-plan.md). The ways in:
 *
 *   sign-up    requestSignupCode → confirmSignup          (a code proves the email; the password is sent only with it)
 *   sign-in    passwordSignIn → verifyPasswordSignIn      (a right password opens a code; only the code signs in)
 *   forgotten  requestPasswordReset → confirmPasswordReset
 *   migrating  setPassword                                (a signed-in driver who has none yet)
 */
export interface PasswordAccountDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly credentialRepo: CredentialRepository;
  readonly otpRepo: OtpRepository;
  readonly otpSender: OtpSender;
  readonly otpCodeGenerator: OtpCodeGenerator;
  readonly passwordHasher: PasswordHasher;
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly unitOfWork: UnitOfWork;
  /** `DRIVER_INVITE_REQUIRED`: false lets a new driver in with no code. */
  readonly inviteRequired: boolean;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type OtpCheckError =
  OtpNotFound | OtpExpired | OtpAlreadyConsumed | OtpIncorrect | TooManyAttempts;

export type PasswordError = PasswordTooShort | PasswordTooLong | PasswordIsEmail;

export interface SignedIn extends IssuedSession {
  readonly driver: Driver;
}

// A valid scrypt hash of a random password nobody knows. Checked against when the email does not match an account, so a wrong
// email takes as long as a wrong password. (The same decoy staff sign-in uses.)
export const TIMING_DECOY_HASH =
  'scrypt$32768$8$1$m0TAaeC8QwOWfjrR7yYOAw==$3gKOuoWXwXQubsB5y6HMWCAuBmmZybcF+62KpQLvqsK6YRNv+aEw8tPKRrUrRVWLYLdXE7V37xz6e2olxHQnEA==';

/** Checks a typed code against the latest one sent to this identifier. A wrong guess is counted, so it is saved either way. */
async function consumeOtp(
  deps: PasswordAccountDeps,
  identifier: string,
  code: string,
  now: Date,
): Promise<Result<void, OtpCheckError>> {
  const otp = await deps.otpRepo.findLatestFor(identifier);
  if (!otp) return err({ tag: 'OtpNotFound' });
  const { outcome, next } = verifyOtpCode(otp, sha256Hex(code), now);
  await deps.otpRepo.save(identifier, next);
  return outcome.ok ? ok(undefined) : outcome;
}

async function inviteIsUsable(
  deps: PasswordAccountDeps,
  code: string | undefined,
): Promise<Result<void, InviteCodeRequired | InvalidInviteCode>> {
  if (!deps.inviteRequired) return ok(undefined);
  if (!code) return err({ tag: 'InviteCodeRequired' });
  const invite = await deps.inviteCodeRepo.findByCode(code);
  return !invite || isRedeemed(invite) ? err({ tag: 'InvalidInviteCode' }) : ok(undefined);
}

// ---- Sign-up ------------------------------------------------------------------------------

export type RequestSignupCodeError =
  | InvalidIdentifier
  | EmailRequired
  | AccountExists
  | InviteCodeRequired
  | InvalidInviteCode
  | CodeNotSent;

/** Step 1: emails a code to a new address. Nothing is stored about the driver yet, so no password is held waiting. */
export async function requestSignupCode(
  deps: PasswordAccountDeps,
  input: { readonly email: string; readonly inviteCode?: string | undefined },
): Promise<Result<void, RequestSignupCodeError>> {
  const email = emailIdentifier(input.email);
  if (!email.ok) return email;
  if (await deps.driverRepo.findByIdentifier(email.value)) return err({ tag: 'AccountExists' });
  const invite = await inviteIsUsable(deps, input.inviteCode);
  if (!invite.ok) return invite;
  return issueOtp(deps, email.value);
}

export type ConfirmSignupError =
  | InvalidIdentifier
  | EmailRequired
  | PasswordError
  | OtpCheckError
  | AccountExists
  | InviteCodeRequired
  | InvalidInviteCode;

/** Step 2: the code proves the email is theirs, then the account and its password are made together and they are signed in. */
export async function confirmSignup(
  deps: PasswordAccountDeps,
  input: {
    readonly email: string;
    readonly password: string;
    readonly code: string;
    readonly inviteCode?: string | undefined;
  },
): Promise<Result<SignedIn, ConfirmSignupError>> {
  const email = emailIdentifier(input.email);
  if (!email.ok) return email;
  // Before the code is used up, so a too-short password does not cost them a code.
  const strength = validatePassword(input.password, email.value);
  if (!strength.ok) return strength;

  const now = deps.clock.now();
  const checked = await consumeOtp(deps, email.value, input.code, now);
  if (!checked.ok) return checked;
  if (await deps.driverRepo.findByIdentifier(email.value)) return err({ tag: 'AccountExists' });

  const created = await createDriver(deps, {
    identifier: email.value,
    inviteCode: input.inviteCode,
    passwordHash: await deps.passwordHasher.hash(input.password),
    now,
  });
  if (!created.ok) return created;
  return ok({ ...(await issueSession(deps, created.value, now)), driver: created.value });
}

// ---- Sign-in ------------------------------------------------------------------------------

export type PasswordSignInError =
  InvalidIdentifier | InvalidCredentials | TooManyAttempts | CodeNotSent;

/**
 * Step 1 of signing in. A right password never signs anyone in on its own: it sends a code, and the code does. A wrong email and a wrong
 * password give the same answer, and take the same time.
 */
export async function passwordSignIn(
  deps: PasswordAccountDeps,
  input: { readonly identifier: string; readonly password: string },
): Promise<Result<void, PasswordSignInError>> {
  const forms = identifierForms(input.identifier);
  if (!forms.ok) return forms;
  const driver = await deps.driverRepo.findByAnyIdentifier(forms.value);
  const credential = driver ? await deps.credentialRepo.findByDriverId(driver.id) : null;
  const now = deps.clock.now();

  // Checked before the password, so a right guess during a lockout does not get through.
  if (credential && isLockedOut(credential, now)) return err({ tag: 'TooManyAttempts' });

  const passwordOk = await deps.passwordHasher.verify(
    input.password,
    credential?.passwordHash ?? TIMING_DECOY_HASH,
  );
  if (!driver || !credential || !passwordOk) {
    if (credential) await deps.credentialRepo.save(afterWrongPassword(credential, now));
    return err({ tag: 'InvalidCredentials' });
  }
  if (credential.failedAttempts > 0) {
    await deps.credentialRepo.save(afterRightPassword(credential, now));
  }
  return issueOtp(deps, driver.identifier);
}

export type VerifyPasswordSignInError = InvalidIdentifier | InvalidCredentials | OtpCheckError;

/** Step 2: the emailed code. Only an account with a password can come this way. */
export async function verifyPasswordSignIn(
  deps: PasswordAccountDeps,
  input: { readonly identifier: string; readonly code: string },
): Promise<Result<SignedIn, VerifyPasswordSignInError>> {
  const forms = identifierForms(input.identifier);
  if (!forms.ok) return forms;
  const driver = await deps.driverRepo.findByAnyIdentifier(forms.value);
  if (!driver || !(await deps.credentialRepo.findByDriverId(driver.id))) {
    return err({ tag: 'InvalidCredentials' });
  }
  const now = deps.clock.now();
  const checked = await consumeOtp(deps, driver.identifier, input.code, now);
  if (!checked.ok) return checked;
  return ok({ ...(await issueSession(deps, driver, now)), driver });
}

// ---- Forgotten password -------------------------------------------------------------------

export type RequestPasswordResetError = InvalidIdentifier | EmailRequired;

/**
 * Emails a code to an address that has an account, and quietly does nothing for one that has not: the answer is the same either way,
 * so this cannot be used to find out who has an account. A send that fails is logged by the sender, not reported here, for the same reason.
 */
export async function requestPasswordReset(
  deps: PasswordAccountDeps,
  input: { readonly email: string },
): Promise<Result<void, RequestPasswordResetError>> {
  const email = emailIdentifier(input.email);
  if (!email.ok) return email;
  if (await deps.driverRepo.findByIdentifier(email.value)) {
    await issueOtp(deps, email.value);
  }
  return ok(undefined);
}

export type ConfirmPasswordResetError =
  InvalidIdentifier | EmailRequired | PasswordError | InvalidCredentials | OtpCheckError;

/** The code proves the inbox is theirs; the new password replaces any old one, every other session ends, and they are signed in. */
export async function confirmPasswordReset(
  deps: PasswordAccountDeps,
  input: { readonly email: string; readonly code: string; readonly newPassword: string },
): Promise<Result<SignedIn, ConfirmPasswordResetError>> {
  const email = emailIdentifier(input.email);
  if (!email.ok) return email;
  const strength = validatePassword(input.newPassword, email.value);
  if (!strength.ok) return strength;
  const driver = await deps.driverRepo.findByIdentifier(email.value);
  if (!driver) return err({ tag: 'InvalidCredentials' });

  const now = deps.clock.now();
  const checked = await consumeOtp(deps, driver.identifier, input.code, now);
  if (!checked.ok) return checked;

  await deps.credentialRepo.save(
    newCredential(driver.id, await deps.passwordHasher.hash(input.newPassword), now),
  );
  // Whoever had a copy of the old password, or a stolen session, is out.
  await deps.sessionRepo.revokeAllForDriver(driver.id, now);
  return ok({ ...(await issueSession(deps, driver, now)), driver });
}

// ---- A signed-in driver adds a password ---------------------------------------------------

export type SetPasswordError = DriverNotFound | EmailRequired | PasswordAlreadySet | PasswordError;

/**
 * For a driver who signed in with a code alone (or Google or Apple) and has no password: they can add one. They are already signed in,
 * and from then on the code-only door is closed to them. Changing an existing password goes through "forgot password".
 */
export async function setPassword(
  deps: PasswordAccountDeps,
  input: { readonly driverId: DriverId; readonly password: string },
): Promise<Result<void, SetPasswordError>> {
  const driver = await deps.driverRepo.findById(input.driverId);
  if (!driver) return err({ tag: 'DriverNotFound' });
  const email = emailIdentifier(driver.identifier);
  if (!email.ok) return err({ tag: 'EmailRequired' });
  if (await deps.credentialRepo.findByDriverId(driver.id))
    return err({ tag: 'PasswordAlreadySet' });
  const strength = validatePassword(input.password, email.value);
  if (!strength.ok) return strength;

  const now = deps.clock.now();
  await deps.credentialRepo.save(
    newCredential(driver.id, await deps.passwordHasher.hash(input.password), now),
  );
  return ok(undefined);
}
