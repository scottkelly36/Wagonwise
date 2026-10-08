import type { CompanyId, StaffId, VehicleId } from '../../domain/check-template.js';
import type { DriverId } from '../../domain/check.js';

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

/** The company's vehicles. Supplied by composition over `fleet` (AGENTS.md rule 7). */
export interface VehicleDirectory {
  belongsToCompany(vehicleId: VehicleId, companyId: CompanyId): Promise<boolean>;
  /** A vehicle's company and name, or `null`. */
  find(
    vehicleId: VehicleId,
  ): Promise<{ readonly companyId: CompanyId; readonly name: string } | null>;
}

/** The vehicle on the driver's current job, if any: the one they are about to take out. Supplied by composition
 *  over `jobs` and `fleet`. */
export interface DriverVehicle {
  currentVehicle(driverId: DriverId): Promise<{
    readonly id: VehicleId;
    readonly companyId: CompanyId;
    readonly name: string;
  } | null>;
}

/** Whether a driver belongs to a company: an active link, not an invitation. Supplied over `fleet`. */
export interface DriverMembership {
  isActiveDriverOfCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean>;
}

/** A driver's own identifier, for the `driver` data scope. Supplied over `identity`. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: DriverId): Promise<string | null>;
}
