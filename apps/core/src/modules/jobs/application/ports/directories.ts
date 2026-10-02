import type { CompanyId, DriverId, VehicleId } from '../../domain/job.js';

/** What jobs needs to know about drivers, in its own terms (AGENTS.md rule 7); composition
 *  supplies it over fleet's driver links (P2-M2.8 — "belongs" means an *active* link; a driver
 *  merely invited or requested doesn't). */
export interface DriverDirectory {
  belongsToCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean>;
}

/** Same, over fleet's vehicles. */
export interface VehicleDirectory {
  belongsToCompany(vehicleId: VehicleId, companyId: CompanyId): Promise<boolean>;
}
