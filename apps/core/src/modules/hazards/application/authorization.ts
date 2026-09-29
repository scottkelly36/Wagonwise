import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { AdminDirectory, StaffId } from './ports/admin-directory.js';

/** The caller isn't allowed to do this. Mapped to 403 in `interface/error-mapping.ts`. */
export type Forbidden = TaggedError<'Forbidden'>;

/**
 * Who may permanently delete hazards and browse every report (P2-M1.8): WagonWise admins only.
 * Checked in the use cases, before the target is looked up, so no caller can skip it and a
 * non-admin never learns whether an id exists. Confirm/dismiss stay open to every driver
 * (decision 63).
 */
export async function requireHazardAdmin(
  admins: AdminDirectory,
  callerId: StaffId,
): Promise<Result<void, Forbidden>> {
  return (await admins.isAdmin(callerId)) ? ok(undefined) : err({ tag: 'Forbidden' });
}
