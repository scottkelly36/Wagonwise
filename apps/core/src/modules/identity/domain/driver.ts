import type { Id } from '../../../shared/brand.js';

export type DriverId = Id<'DriverId'>;

/** A signed-in tester. Phase 1 has no profile beyond the identifier they signed in with. */
export interface Driver {
  readonly id: DriverId;
  /** Already normalised by normalizeIdentifier() before a Driver is ever constructed. */
  readonly identifier: string;
  readonly createdAt: Date;
  /** What the driver likes to be called, so a company can tell its drivers apart. Optional: a driver who has
   *  not given one is shown by their sign-in identifier. Cleared by `anonymize()`. */
  readonly name?: string | undefined;
  /** Design doc §9's "privacy notice and consent screen at first launch" — unset until the
   *  driver accepts it, set once, never cleared (M8). */
  readonly consentedAt?: Date | undefined;
  /** Set by account deletion (M8, design doc §9's "a way for a tester to delete their account and
   *  data") — the row survives (identity.sessions/devices still reference it, and other modules
   *  hold this id too), but `identifier` is overwritten with an opaque placeholder by
   *  `anonymize()`, so the only real PII on a Driver no longer exists anywhere. */
  readonly deletedAt?: Date | undefined;
  // No admin flag or privileges here since P2-M1.12c: dashboard access belongs to staff
  // accounts (the `companies` module), never to a driver.
  // No company here either, since P2-M2.8: a driver's companies are `fleet.driver_links`
  // (several at once, each with its own decided history), not a single column on this record.
}

export function consent(driver: Driver, now: Date): Driver {
  return { ...driver, consentedAt: now };
}

export const MAX_DRIVER_NAME_LENGTH = 60;

/** Tidies a typed name: trimmed, runs of spaces made one. Empty gives `undefined`, which clears the name. A name
 *  over the limit is `'too_long'`, never cut off silently. */
export function normalizeDriverName(raw: string): string | undefined | 'too_long' {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '') return undefined;
  return name.length > MAX_DRIVER_NAME_LENGTH ? 'too_long' : name;
}

export function setName(driver: Driver, name: string | undefined): Driver {
  return { ...driver, name };
}

/** A stable, unique, obviously-not-a-real-identifier placeholder — `identifier` is unique in the
 *  database, and `driver.id` already is too, so this can never collide. */
function deletedIdentifierFor(driver: Driver): string {
  return `deleted:${driver.id}`;
}

export function isDeleted(driver: Driver): boolean {
  return driver.deletedAt !== undefined;
}

/** Scrubs the real PII a `Driver` holds: the sign-in identifier and the name. Idempotent-safe to call again on an
 *  already-deleted driver (same reasoning as `session.ts`'s own `revoke()`) — the use case
 *  (`delete-account.ts`) is what actually enforces "don't bother," this just wouldn't corrupt
 *  anything if it were called twice. */
export function anonymize(driver: Driver, now: Date): Driver {
  return { ...driver, identifier: deletedIdentifierFor(driver), name: undefined, deletedAt: now };
}
