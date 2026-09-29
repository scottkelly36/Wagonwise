import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId } from '../domain/driver.js';
import type { DriverRepository } from './ports/driver-repository.js';

/** The caller isn't allowed to do this. Mapped to 403 in `interface/error-mapping.ts`. */
export type Forbidden = TaggedError<'Forbidden'>;

/**
 * The user-management and invite-code screens' rule (P2-M1.8): WagonWise admins only. It lives
 * here, in the use cases, rather than in the routes, so no caller of a use case can skip it.
 * Unknown or removed callers are refused the same as non-admins. P2-M1.12 swaps the driver's
 * `isAdmin` flag for a platform staff account; the use cases keep calling this.
 */
export async function requireAdmin(
  driverRepo: Pick<DriverRepository, 'findById'>,
  callerId: DriverId,
): Promise<Result<void, Forbidden>> {
  const caller = await driverRepo.findById(callerId);
  return caller?.isAdmin ? ok(undefined) : err({ tag: 'Forbidden' });
}
