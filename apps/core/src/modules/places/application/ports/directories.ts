import type { CompanyId, DriverId, StaffId } from '../../domain/place.js';

/** Whether a driver belongs to a company: an *active* link, not an invitation. Supplied by composition
 *  over fleet's driver links (AGENTS.md rule 7: places never imports fleet). */
export interface DriverMembership {
  isActiveDriverOfCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean>;
}

/** Who a signed-in staff account is, as far as places' permission checks care. */
export type StaffCaller =
  | { readonly kind: 'platform' }
  | {
      readonly kind: 'fleet';
      readonly companyId: CompanyId;
      readonly privileges: readonly string[];
    };

export interface CallerDirectory {
  /** `null` for an unknown or removed account. */
  getCaller(staffId: StaffId): Promise<StaffCaller | null>;
}

/** A driver's sign-in, for the `driver` data scope. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: DriverId): Promise<string | null>;
}
