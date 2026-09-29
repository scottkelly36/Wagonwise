import type { Id } from '../../../shared/brand.js';

export type DriverId = Id<'DriverId'>;
/** Same brand name as companies' own `CompanyId` (decision 46) — declared here rather than
 *  imported, since identity's `application/update-driver.ts` is the one place this field is
 *  ever set. */
export type CompanyId = Id<'CompanyId'>;

/** A signed-in tester. Phase 1 has no profile beyond the identifier they signed in with. */
export interface Driver {
  readonly id: DriverId;
  /** Already normalised by normalizeIdentifier() before a Driver is ever constructed. */
  readonly identifier: string;
  readonly createdAt: Date;
  /** Design doc §9's "privacy notice and consent screen at first launch" — unset until the
   *  driver accepts it, set once, never cleared (M8). */
  readonly consentedAt?: Date | undefined;
  /** Set by account deletion (M8, design doc §9's "a way for a tester to delete their account and
   *  data") — the row survives (identity.sessions/devices still reference it, and other modules
   *  hold this id too), but `identifier` is overwritten with an opaque placeholder by
   *  `anonymize()`, so the only real PII on a Driver no longer exists anywhere. */
  readonly deletedAt?: Date | undefined;
  /** A driver belongs to at most one company at a time (2026-09-27: "one driver, one company,
   *  but drivers change jobs so they can change companies") — unset until an admin assigns one,
   *  via `application/update-driver.ts`. No history of past companies is kept. */
  readonly companyId?: CompanyId | undefined;
  // No admin flag or privileges here since P2-M1.12c: dashboard access belongs to staff
  // accounts (the `companies` module), never to a driver.
}

export function consent(driver: Driver, now: Date): Driver {
  return { ...driver, consentedAt: now };
}

/** A stable, unique, obviously-not-a-real-identifier placeholder — `identifier` is unique in the
 *  database, and `driver.id` already is too, so this can never collide. */
function deletedIdentifierFor(driver: Driver): string {
  return `deleted:${driver.id}`;
}

export function isDeleted(driver: Driver): boolean {
  return driver.deletedAt !== undefined;
}

/** Scrubs the one real piece of PII a Phase 1 `Driver` holds. Idempotent-safe to call again on an
 *  already-deleted driver (same reasoning as `session.ts`'s own `revoke()`) — the use case
 *  (`delete-account.ts`) is what actually enforces "don't bother," this just wouldn't corrupt
 *  anything if it were called twice. */
export function anonymize(driver: Driver, now: Date): Driver {
  return { ...driver, identifier: deletedIdentifierFor(driver), deletedAt: now };
}
