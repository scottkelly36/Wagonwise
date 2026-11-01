import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Driver, DriverId } from '../domain/driver.js';
import type { InvalidIdentifier } from '../domain/identifier.js';
import type {
  InvalidIdToken,
  ProviderNotConfigured,
  SocialProvider,
} from '../domain/federated-identity.js';
import { emailIdentifier, type EmailRequired } from '../domain/password.js';
import type {
  AccountExists,
  AlreadyLinked,
  CodeNotSent,
  DriverNotFound,
  EmailAlreadySet,
} from './errors.js';
import { issueOtp } from './issue-otp.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { FederatedIdentityRepository } from './ports/federated-identity-repository.js';
import type { IdTokenVerifier } from './ports/id-token-verifier.js';
import type { OtpCodeGenerator } from './ports/otp-code-generator.js';
import type { OtpRepository } from './ports/otp-repository.js';
import type { OtpSender } from './ports/otp-sender.js';
import { consumeOtp, type OtpCheckError } from './password-accounts.js';

/**
 * Ways a driver who is already signed in joins more sign-in methods to the account they have, so nobody has to start again with an
 * empty one: add a Google or Apple login (`linkSocial`), or add an email to an account made with a phone number
 * (`requestEmailAddition`, `confirmEmailAddition`). They are signed in, so the session is the proof of whose account it is.
 */
export interface AccountLinkDeps {
  readonly driverRepo: DriverRepository;
  readonly federatedRepo: FederatedIdentityRepository;
  readonly idTokenVerifier: IdTokenVerifier;
  readonly otpRepo: OtpRepository;
  readonly otpSender: OtpSender;
  readonly otpCodeGenerator: OtpCodeGenerator;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type LinkSocialError =
  InvalidIdToken | ProviderNotConfigured | DriverNotFound | AlreadyLinked;

/**
 * Adds this Google or Apple login to the signed-in driver's account, after which signing in with it finds them. The login must be one
 * that is not already on another account (that would need two accounts joined, which is not supported). Doing it twice is fine.
 */
export async function linkSocial(
  deps: AccountLinkDeps,
  input: {
    readonly driverId: DriverId;
    readonly provider: SocialProvider;
    readonly idToken: string;
  },
): Promise<Result<void, LinkSocialError>> {
  const driver = await deps.driverRepo.findById(input.driverId);
  if (!driver) return err({ tag: 'DriverNotFound' });
  const verified = await deps.idTokenVerifier.verify(input.provider, input.idToken);
  if (!verified.ok) return verified;
  const { subject, email, emailVerified } = verified.value;

  const known = await deps.federatedRepo.find(input.provider, subject);
  if (known) {
    return known.driverId === driver.id ? ok(undefined) : err({ tag: 'AlreadyLinked' });
  }
  const address = email !== undefined && emailVerified ? emailIdentifier(email) : undefined;
  await deps.federatedRepo.save({
    provider: input.provider,
    subject,
    driverId: driver.id,
    email: address?.ok ? address.value : undefined,
    createdAt: deps.clock.now(),
  });
  return ok(undefined);
}

export type RequestEmailAdditionError =
  | DriverNotFound
  | InvalidIdentifier
  | EmailRequired
  | EmailAlreadySet
  | AccountExists
  | CodeNotSent;

/** Only an account made with a phone number can add an email, and not one that another account already uses. */
async function checkEmailCanBeAdded(
  deps: AccountLinkDeps,
  driverId: DriverId,
  rawEmail: string,
): Promise<
  Result<
    { readonly driver: Driver; readonly email: string },
    DriverNotFound | InvalidIdentifier | EmailRequired | EmailAlreadySet | AccountExists
  >
> {
  const driver = await deps.driverRepo.findById(driverId);
  if (!driver) return err({ tag: 'DriverNotFound' });
  if (emailIdentifier(driver.identifier).ok) return err({ tag: 'EmailAlreadySet' });
  const email = emailIdentifier(rawEmail);
  if (!email.ok) return email;
  if (await deps.driverRepo.findByIdentifier(email.value)) return err({ tag: 'AccountExists' });
  return ok({ driver, email: email.value });
}

/** Step 1: emails a code to the new address, to prove it is theirs. */
export async function requestEmailAddition(
  deps: AccountLinkDeps,
  input: { readonly driverId: DriverId; readonly email: string },
): Promise<Result<void, RequestEmailAdditionError>> {
  const checked = await checkEmailCanBeAdded(deps, input.driverId, input.email);
  if (!checked.ok) return checked;
  return issueOtp(deps, checked.value.email);
}

export type ConfirmEmailAdditionError =
  | DriverNotFound
  | InvalidIdentifier
  | EmailRequired
  | EmailAlreadySet
  | AccountExists
  | OtpCheckError;

/**
 * Step 2: the code makes the email the account's sign-in identifier, in place of the phone number. The account keeps everything it
 * has (vehicles, routes, company links); from now on it signs in by email, and can have a password.
 */
export async function confirmEmailAddition(
  deps: AccountLinkDeps,
  input: { readonly driverId: DriverId; readonly email: string; readonly code: string },
): Promise<Result<Driver, ConfirmEmailAdditionError>> {
  const checked = await checkEmailCanBeAdded(deps, input.driverId, input.email);
  if (!checked.ok) return checked;
  const code = await consumeOtp(deps, checked.value.email, input.code, deps.clock.now());
  if (!code.ok) return code;

  const updated: Driver = { ...checked.value.driver, identifier: checked.value.email };
  await deps.driverRepo.save(updated);
  return ok(updated);
}
