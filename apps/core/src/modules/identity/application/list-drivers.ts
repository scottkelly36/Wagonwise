import type { Driver } from '../domain/driver.js';
import type { DriverRepository } from './ports/driver-repository.js';

export interface ListDriversDeps {
  readonly driverRepo: Pick<DriverRepository, 'findAll'>;
}

/** The user-management screen's own read (2026-09-27) — admin-gated at the interface layer, not
 *  here, same split as every other module's routes.ts owning the gate rather than the use case. */
export async function listDrivers(deps: ListDriversDeps): Promise<Driver[]> {
  return deps.driverRepo.findAll();
}
