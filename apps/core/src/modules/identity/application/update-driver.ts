import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, Driver, DriverId } from '../domain/driver.js';
import { requirePlatformStaff, type Forbidden } from './authorization.js';
import type { DriverNotFound } from './errors.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { PlatformStaffDirectory, StaffId } from './ports/platform-staff.js';

export interface UpdateDriverDeps {
  readonly driverRepo: Pick<DriverRepository, 'findById' | 'save'>;
  readonly staff: PlatformStaffDirectory;
}

export interface UpdateDriverInput {
  /** The signed-in staff member; must be a WagonWise admin (P2-M1.12c). */
  readonly callerId: StaffId;
  readonly id: DriverId;
  /** `undefined` (key omitted entirely): leave unchanged. `null`: clear the assignment — the
   *  driver has no company right now. A real id: assign to that company. Not validated against
   *  companies' own data (no cross-context existence check) — the dashboard only ever offers
   *  ids from the companies list, so this is a trusted-input path. */
  readonly companyId?: CompanyId | null;
}

export type UpdateDriverError = Forbidden | DriverNotFound;

/** WagonWise admins only (`authorization.ts`, checked before the target is looked up, so nobody
 *  else can learn whether a driver id exists). Changes which company a driver belongs to. The
 *  driver admin flag and privileges it used to set are gone (P2-M1.12c): dashboard access is a
 *  staff account's, never a driver's. */
export async function updateDriver(
  deps: UpdateDriverDeps,
  input: UpdateDriverInput,
): Promise<Result<Driver, UpdateDriverError>> {
  const allowed = await requirePlatformStaff(deps.staff, input.callerId);
  if (!allowed.ok) return allowed;
  const driver = await deps.driverRepo.findById(input.id);
  if (!driver) {
    return err({ tag: 'DriverNotFound' });
  }

  const updated: Driver = {
    ...driver,
    ...(input.companyId !== undefined
      ? { companyId: input.companyId === null ? undefined : input.companyId }
      : {}),
  };
  await deps.driverRepo.save(updated);
  return ok(updated);
}
