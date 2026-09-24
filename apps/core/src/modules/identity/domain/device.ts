import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId } from './driver.js';

export type DeviceId = Id<'DeviceId'>;

/**
 * A driver's registered device (design doc §3: Identity owns "Devices (push token)"). Keyed by
 * `pushToken`, not one-device-per-driver — a driver could plausibly have more than one device,
 * and a device's Expo push token is itself a stable per-install identifier, so re-registering
 * the same token (app reopened, no change) or reassigning it to a different driver (one phone,
 * a new sign-in) are both just an upsert on `pushToken`, never a duplicate row (`registerDevice`,
 * application/).
 */
export interface Device {
  readonly id: DeviceId;
  readonly driverId: DriverId;
  readonly pushToken: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type InvalidPushToken = TaggedError<'InvalidPushToken'>;

/** A blank token is never legitimate — same "trim and reject empty" rule as every other
 *  free-text identifier in this codebase (routing's `validateName`, feedback's
 *  `validateMessage`). */
export function validatePushToken(raw: string): Result<string, InvalidPushToken> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidPushToken' });
  }
  return ok(trimmed);
}
