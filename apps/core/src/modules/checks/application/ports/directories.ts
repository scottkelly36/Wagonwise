import type { CompanyId, StaffId, VehicleId } from '../../domain/check-template.js';

/** Who a signed-in staff account is, as far as checks' permission rules care. */
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

/** Whether a vehicle is the company's. Supplied by composition over `fleet` (AGENTS.md rule 7). */
export interface VehicleDirectory {
  belongsToCompany(vehicleId: VehicleId, companyId: CompanyId): Promise<boolean>;
}
