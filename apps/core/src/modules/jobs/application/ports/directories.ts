import type { CompanyId, DriverId, VehicleId } from '../../domain/job.js';

/** What jobs needs to know about drivers, in its own terms (AGENTS.md rule 7); composition
 *  supplies it over identity. Until P2-M2's driver-company links, "belongs" is the driver's
 *  single `company_id`. */
export interface DriverDirectory {
  belongsToCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean>;
}

/** Same, over fleet's vehicles. */
export interface VehicleDirectory {
  belongsToCompany(vehicleId: VehicleId, companyId: CompanyId): Promise<boolean>;
}
