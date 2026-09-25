import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { consent, type Driver, type DriverId } from '../domain/driver.js';
import type { DriverNotFound } from './errors.js';
import type { DriverRepository } from './ports/driver-repository.js';

export interface GiveConsentDeps {
  readonly driverRepo: DriverRepository;
  readonly clock: Clock;
}

export interface GiveConsentInput {
  readonly driverId: DriverId;
}

export type GiveConsentError = DriverNotFound;

/** Design doc §9's "privacy notice and consent screen at first launch" (M8) — one tap, recorded
 *  once. Idempotent: consenting again just moves `consentedAt` forward rather than erroring, the
 *  same "tapping it twice must never fail" reasoning as `revokeSession`. */
export async function giveConsent(
  deps: GiveConsentDeps,
  input: GiveConsentInput,
): Promise<Result<Driver, GiveConsentError>> {
  const driver = await deps.driverRepo.findById(input.driverId);
  if (!driver) {
    return err({ tag: 'DriverNotFound' });
  }
  const consented = consent(driver, deps.clock.now());
  await deps.driverRepo.save(consented);
  return ok(consented);
}
