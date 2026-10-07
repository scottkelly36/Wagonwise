import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { anonymize, isDeleted, type DriverId } from '../domain/driver.js';
import type { DriverNotFound } from './errors.js';
import type { DeviceRepository } from './ports/device-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { DriverDataEraser } from './ports/driver-data-eraser.js';
import type { SessionRepository } from './ports/session-repository.js';

export interface DeleteAccountDeps {
  readonly driverRepo: DriverRepository;
  readonly sessionRepo: SessionRepository;
  readonly deviceRepo: DeviceRepository;
  /** Removes the driver's data held by other modules (vehicle profiles, routes, feedback...). */
  readonly dataEraser: DriverDataEraser;
  readonly clock: Clock;
}

export interface DeleteAccountInput {
  readonly driverId: DriverId;
}

export type DeleteAccountError = DriverNotFound;

/**
 * Design doc §9's "a way for a tester to delete their account and data" (M8). First removes the
 * driver's data held elsewhere (vehicle profiles, routes and trips, feedback, company links: the
 * `dataEraser`), and only then scrubs the sign-in identifier (`anonymize()`), revokes every session
 * and deletes every device, so nothing keeps working after the tap. The erasing comes first so that
 * a failure part-way leaves the account intact and the whole thing can simply be tried again; once
 * the identifier is scrubbed the account counts as deleted. The row itself survives (see
 * `driver.ts`'s doc comment): hazard, congestion and parking reports the driver filed stay, linked
 * only to that scrubbed row, so they cannot be traced back to a person.
 *
 * Idempotent: calling this again on an already-deleted driver is a no-op success, not an error —
 * the access token making the call might still be valid for up to 15 minutes after the *first*
 * call (design doc §9's own documented access-token-revocation trade-off), so a retry or a second
 * tap before that window closes must not fail.
 */
export async function deleteAccount(
  deps: DeleteAccountDeps,
  input: DeleteAccountInput,
): Promise<Result<void, DeleteAccountError>> {
  const driver = await deps.driverRepo.findById(input.driverId);
  if (!driver) {
    return err({ tag: 'DriverNotFound' });
  }
  if (isDeleted(driver)) {
    return ok(undefined);
  }

  await deps.dataEraser.erase({ driverId: driver.id, identifier: driver.identifier });

  const now = deps.clock.now();
  await deps.driverRepo.save(anonymize(driver, now));
  await deps.sessionRepo.revokeAllForDriver(driver.id, now);
  await deps.deviceRepo.deleteAllForDriver(driver.id);
  return ok(undefined);
}
