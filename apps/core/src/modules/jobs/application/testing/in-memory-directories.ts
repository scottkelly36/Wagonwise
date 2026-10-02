import type { CompanyId, DriverId, VehicleId } from '../../domain/job.js';
import type { DriverDirectory, VehicleDirectory } from '../ports/directories.js';

/** `driverId -> companyId`, for use-case tests. */
export class InMemoryDriverDirectory implements DriverDirectory {
  constructor(private readonly companies: ReadonlyMap<DriverId, CompanyId>) {}
  belongsToCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean> {
    return Promise.resolve(this.companies.get(driverId) === companyId);
  }
}

export class InMemoryVehicleDirectory implements VehicleDirectory {
  constructor(private readonly companies: ReadonlyMap<VehicleId, CompanyId>) {}
  belongsToCompany(vehicleId: VehicleId, companyId: CompanyId): Promise<boolean> {
    return Promise.resolve(this.companies.get(vehicleId) === companyId);
  }
}
