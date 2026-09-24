import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { ok, type Result } from '../../../shared/result.js';
import { validatePushToken, type Device, type InvalidPushToken } from '../domain/device.js';
import type { DriverId } from '../domain/driver.js';
import type { DeviceRepository } from './ports/device-repository.js';

export interface RegisterDeviceDeps {
  readonly repo: DeviceRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RegisterDeviceInput {
  readonly driverId: DriverId;
  readonly pushToken: string;
}

export type RegisterDeviceError = InvalidPushToken;

/**
 * Registers (or re-registers) a device's Expo push token. Upsert on `pushToken`, not
 * one-row-per-call: reopening the app with an unchanged token just refreshes `updatedAt`, and a
 * token that shows up under a different driver (same physical device, a new sign-in) is
 * reassigned rather than left pointing at whoever registered it first — a stale token belonging
 * to a driver who signed out must never keep receiving another driver's alerts.
 */
export async function registerDevice(
  deps: RegisterDeviceDeps,
  input: RegisterDeviceInput,
): Promise<Result<Device, RegisterDeviceError>> {
  const validated = validatePushToken(input.pushToken);
  if (!validated.ok) {
    return validated;
  }

  const now = deps.clock.now();
  const existing = await deps.repo.findByPushToken(validated.value);
  const device: Device = existing
    ? { ...existing, driverId: input.driverId, updatedAt: now }
    : {
        id: makeId<'DeviceId'>(deps.ids.newId()),
        driverId: input.driverId,
        pushToken: validated.value,
        createdAt: now,
        updatedAt: now,
      };

  await deps.repo.save(device);
  return ok(device);
}
