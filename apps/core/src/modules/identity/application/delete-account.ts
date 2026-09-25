import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { anonymize, isDeleted, type DriverId } from '../domain/driver.js';
import type { DriverNotFound } from './errors.js';
import type { DeviceRepository } from './ports/device-repository.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { SessionRepository } from './ports/session-repository.js';

export interface DeleteAccountDeps {
  readonly driverRepo: DriverRepository;
  readonly sessionRepo: SessionRepository;
  readonly deviceRepo: DeviceRepository;
  readonly clock: Clock;
}

export interface DeleteAccountInput {
  readonly driverId: DriverId;
}

export type DeleteAccountError = DriverNotFound;

/**
 * Design doc §9's "a way for a tester to delete their account and data" (M8). Scrubs the one
 * piece of real PII a Phase 1 `Driver` holds (`anonymize()`), then revokes every session and
 * deletes every device for this driver so nothing keeps working after the tap — the row itself
 * survives (see `driver.ts`'s own doc comment on why a hard delete isn't worth the FK cleanup).
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

  const now = deps.clock.now();
  await deps.driverRepo.save(anonymize(driver, now));
  await deps.sessionRepo.revokeAllForDriver(driver.id, now);
  await deps.deviceRepo.deleteAllForDriver(driver.id);
  return ok(undefined);
}
