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

/** A company vehicle's name, for the reports (P2-M8). Supplied by composition over fleet. */
export interface VehicleNameDirectory {
  getName(vehicleId: VehicleId): Promise<string | null>;
}

/** Resolves a driver's identifier, needed for the `driver` data scope (P2-M5.1) — same shape as
 *  fleet's own port of the same name; composition supplies both over identity's
 *  `getDriverIdentifier`. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: DriverId): Promise<string | null>;
}

/** What the walk-round checks say about sending a vehicle out: fine, its check is still to do, or it has a "do not
 *  drive" defect open. Supplied by composition over `checks`, which holds the company's settings. */
export type StartVerdict = 'ok' | 'check_required' | 'vehicle_not_fit';

export interface JobStartGate {
  check(companyId: CompanyId, vehicleId: VehicleId): Promise<StartVerdict>;
}
