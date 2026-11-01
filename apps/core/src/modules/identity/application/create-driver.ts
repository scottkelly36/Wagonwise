import { makeId } from '../../../shared/brand.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { UnitOfWork } from '../../../shared/ports/unit-of-work.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Driver, DriverId } from '../domain/driver.js';
import { isRedeemed, redeem } from '../domain/invite-code.js';
import { newCredential } from '../domain/password.js';
import type { InvalidInviteCode, InviteCodeRequired } from './errors.js';
import type { CredentialRepository } from './ports/credential-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';

export interface CreateDriverDeps {
  readonly driverRepo: DriverRepository;
  readonly inviteCodeRepo: InviteCodeRepository;
  readonly credentialRepo: CredentialRepository;
  readonly unitOfWork: UnitOfWork;
  /** `DRIVER_INVITE_REQUIRED`: false lets a new driver in with no code. */
  readonly inviteRequired: boolean;
  readonly ids: IdGenerator;
}

export interface CreateDriverInput {
  readonly identifier: string;
  readonly inviteCode: string | undefined;
  /** Set when the driver chose a password at sign-up; saved with the account, in one commit. */
  readonly passwordHash?: string | undefined;
  readonly now: Date;
}

/**
 * Makes a driver, redeeming the invite code in the same commit (so a half-finished sign-up never burns a code).
 *
 * With codes optional (`DRIVER_INVITE_REQUIRED=false`), a valid unused code typed anyway is still redeemed, because it records which tester
 * signed up; a missing or wrong one is simply ignored.
 */
export async function createDriver(
  deps: CreateDriverDeps,
  input: CreateDriverInput,
): Promise<Result<Driver, InviteCodeRequired | InvalidInviteCode>> {
  let invite = input.inviteCode ? await deps.inviteCodeRepo.findByCode(input.inviteCode) : null;
  if (invite && isRedeemed(invite)) invite = null;
  if (deps.inviteRequired) {
    if (!input.inviteCode) {
      return err({ tag: 'InviteCodeRequired' });
    }
    if (!invite) {
      return err({ tag: 'InvalidInviteCode' });
    }
  }

  const driverId: DriverId = makeId<'DriverId'>(deps.ids.newId());
  const newDriver: Driver = { id: driverId, identifier: input.identifier, createdAt: input.now };
  const redeemed = invite ? redeem(invite, driverId, input.now) : null;
  if (redeemed && !redeemed.ok) {
    // Lost a race with another call for the same code, between the check above and here — rare at this scale. Not a domain
    // Result: there is no sane per-driver response, so this surfaces as a thrown (infra-level) error and the caller retries.
    throw new Error('invite code redeemed concurrently');
  }

  await deps.unitOfWork.run(async (tx) => {
    await deps.driverRepo.save(newDriver, tx);
    if (redeemed?.ok) await deps.inviteCodeRepo.save(redeemed.value, tx);
    if (input.passwordHash !== undefined) {
      await deps.credentialRepo.save(newCredential(driverId, input.passwordHash, input.now), tx);
    }
  });
  return ok(newDriver);
}
