import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../../shared/ports/unit-of-work.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Driver } from '../domain/driver.js';
import type {
  EmailNotVerified,
  InvalidIdToken,
  ProviderNotConfigured,
  SocialProvider,
} from '../domain/federated-identity.js';
import { emailIdentifier } from '../domain/password.js';
import { createDriver } from './create-driver.js';
import type { DriverNotFound, InvalidInviteCode, InviteCodeRequired } from './errors.js';
import { issueSession } from './issue-session.js';
import type { CredentialRepository } from './ports/credential-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { FederatedIdentityRepository } from './ports/federated-identity-repository.js';
import type { IdTokenVerifier } from './ports/id-token-verifier.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';
import type { RefreshTokenGenerator } from './ports/refresh-token-generator.js';
import type { SessionRepository } from './ports/session-repository.js';
import type { TokenSigner } from './ports/token-signer.js';
import type { SignedIn } from './password-accounts.js';

export interface SocialSignInDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly credentialRepo: CredentialRepository;
  readonly federatedRepo: FederatedIdentityRepository;
  readonly idTokenVerifier: IdTokenVerifier;
  readonly sessionRepo: SessionRepository;
  readonly tokenSigner: TokenSigner;
  readonly refreshTokenGenerator: RefreshTokenGenerator;
  readonly unitOfWork: UnitOfWork;
  /** `DRIVER_INVITE_REQUIRED`: false lets a new driver in with no code. */
  readonly inviteRequired: boolean;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type SocialSignInError =
  | InvalidIdToken
  | ProviderNotConfigured
  | EmailNotVerified
  | DriverNotFound
  | InviteCodeRequired
  | InvalidInviteCode;

/**
 * Signs a driver in with a Google or Apple ID token. No code and no password: the provider has already proved who they are, and that is
 * why a driver who signs in this way is not asked for a second factor.
 *
 *   1. Known by the provider's own id (`sub`): that driver. This is how a returning driver is found, and it survives an email change.
 *   2. Otherwise the provider must have confirmed the email, and
 *      a. an account with that email is joined to it (the provider has shown the inbox is theirs, which is what a code would prove), or
 *      b. a new account is made (with an invite code only while codes are required).
 */
export async function socialSignIn(
  deps: SocialSignInDeps,
  input: {
    readonly provider: SocialProvider;
    readonly idToken: string;
    readonly inviteCode?: string | undefined;
  },
): Promise<Result<SignedIn, SocialSignInError>> {
  const verified = await deps.idTokenVerifier.verify(input.provider, input.idToken);
  if (!verified.ok) return verified;
  const { subject, email, emailVerified } = verified.value;
  const now = deps.clock.now();

  const known = await deps.federatedRepo.find(input.provider, subject);
  if (known) {
    const driver = await deps.driverRepo.findById(known.driverId);
    if (!driver) return err({ tag: 'DriverNotFound' });
    return ok({ ...(await issueSession(deps, driver, now)), driver });
  }

  const address = email === undefined ? undefined : emailIdentifier(email);
  if (!emailVerified || address === undefined || !address.ok) {
    return err({ tag: 'EmailNotVerified' });
  }

  let driver: Driver | null = await deps.driverRepo.findByIdentifier(address.value);
  if (!driver) {
    const created = await createDriver(deps, {
      identifier: address.value,
      inviteCode: input.inviteCode,
      now,
    });
    if (!created.ok) return created;
    driver = created.value;
  }
  // Saved after the account, not in the same commit: if this one write were lost, the next sign-in finds the account by its email and
  // links it again, so nothing is left broken.
  await deps.federatedRepo.save({
    provider: input.provider,
    subject,
    driverId: driver.id,
    email: address.value,
    createdAt: now,
  });
  return ok({ ...(await issueSession(deps, driver, now)), driver });
}
