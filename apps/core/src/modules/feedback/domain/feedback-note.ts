import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type FeedbackNoteId = Id<'FeedbackNoteId'>;

// feedback owns its own DriverId rather than importing identity's, matching routing's and
// hazards' own precedent (decision 46) — same brand name, so a value identity produces is usable
// here via makeId(), with no cross-module import.
export type DriverId = Id<'DriverId'>;

/**
 * A tester's free-text note (design doc §8: "Free-text notes to you, with app version and device
 * info attached"). `appVersion`/`deviceInfo` are plain strings the app captures itself
 * (Constants.expoConfig.version / Platform.OS+Version) — core trusts and stores them as given,
 * the same way it trusts a hazard report's `note` field; neither is validated beyond "not sent as
 * nonsense," since it's diagnostic context for the person reading feedback, not data anything
 * else in the domain acts on.
 */
export interface FeedbackNote {
  readonly id: FeedbackNoteId;
  readonly driverId: DriverId;
  readonly message: string;
  readonly appVersion: string;
  readonly deviceInfo: string;
  readonly createdAt: Date;
}

export type InvalidMessage = TaggedError<'InvalidMessage'>;

/** A note with nothing in it tells the reader nothing — never blank, same "trim and reject
 *  empty" rule as routing's `validateName`. */
export function validateMessage(raw: string): Result<string, InvalidMessage> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err({ tag: 'InvalidMessage' });
  }
  return ok(trimmed);
}
