import type { CompanyId } from '../domain/vehicle.js';
import type { Caller } from './ports/caller-directory.js';

/** WagonWise staff (`isAdmin`) can view or manage any company's fleet — scopes only ever open up
 *  permission for a company-scoped driver, never restrict an admin (Phase 2 tech design doc's
 *  decision log, 2026-09-27). A non-admin can view their own company's fleet with no scope
 *  needed — reading your own employer's vehicle list isn't a sensitive action — but can only
 *  create/update/delete with the `manage_fleet` scope. */
export function canViewFleet(caller: Caller, companyId: CompanyId): boolean {
  return caller.isAdmin || caller.companyId === companyId;
}

export function canManageFleet(caller: Caller, companyId: CompanyId): boolean {
  return (
    caller.isAdmin || (caller.companyId === companyId && caller.scopes.includes('manage_fleet'))
  );
}
