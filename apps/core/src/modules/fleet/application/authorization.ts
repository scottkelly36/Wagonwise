import type { CompanyId } from '../domain/vehicle.js';
import type { Caller } from './ports/caller-directory.js';

/** WagonWise admins see and manage every company's fleet. A company's staff see their own
 *  company's vehicles with no privilege needed (it's their employer's list, not sensitive), and
 *  change them only with `manage_fleet`. */
export function canViewFleet(caller: Caller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

export function canManageFleet(caller: Caller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('manage_fleet'))
  );
}
