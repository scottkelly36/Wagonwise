import type { CompanyId, StaffId, VehicleId, VehicleSummary } from '../../domain/maintenance.js';

/** Who a signed-in staff account is, as far as maintenance's permission rules care. */
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

/** The company's vehicles. Supplied by composition over `fleet` (AGENTS.md rule 7). */
export interface VehicleDirectory {
  listForCompany(companyId: CompanyId): Promise<readonly VehicleSummary[]>;
  /** A vehicle's company and details, or `null`. */
  find(vehicleId: VehicleId): Promise<(VehicleSummary & { readonly companyId: CompanyId }) | null>;
}
