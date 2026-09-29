import { ok, type Result } from '../../../shared/result.js';
import type { Driver, DriverId } from '../domain/driver.js';
import { requireAdmin, type Forbidden } from './authorization.js';
import type { DriverRepository } from './ports/driver-repository.js';

export interface ListDriversDeps {
  readonly driverRepo: Pick<DriverRepository, 'findAll' | 'findById'>;
}

/** The user-management screen's own read (2026-09-27). Admins only (P2-M1.8, `authorization.ts`):
 *  a non-admin gets `Forbidden`, never a partial or filtered list. */
export async function listDrivers(
  deps: ListDriversDeps,
  input: { readonly callerId: DriverId },
): Promise<Result<Driver[], Forbidden>> {
  const allowed = await requireAdmin(deps.driverRepo, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.driverRepo.findAll());
}
