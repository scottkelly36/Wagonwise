import { ok, type Result } from '../../../shared/result.js';
import type { Driver } from '../domain/driver.js';
import { requirePlatformStaff, type Forbidden } from './authorization.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { PlatformStaffDirectory, StaffId } from './ports/platform-staff.js';

export interface ListDriversDeps {
  readonly driverRepo: Pick<DriverRepository, 'findAll'>;
  readonly staff: PlatformStaffDirectory;
}

/** The driver-accounts screen's read. WagonWise admins only (`authorization.ts`); anyone else
 *  gets `Forbidden`, never a partial or filtered list. */
export async function listDrivers(
  deps: ListDriversDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<Driver[], Forbidden>> {
  const allowed = await requirePlatformStaff(deps.staff, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.driverRepo.findAll());
}
