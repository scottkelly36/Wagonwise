import type { CompanyId, DriverId } from '../../domain/vehicle.js';

/** Everything a fleet authorization check needs about the calling driver, in one read (AGENTS.md
 *  rule 7 — fleet owns this port with its own types, never importing identity's `Driver`
 *  directly). Implemented by `infrastructure/identity-caller-directory.ts`, adapting identity's
 *  own `getDriverAccess` read-model. `null` for an unknown id. */
export interface Caller {
  readonly isAdmin: boolean;
  readonly companyId?: CompanyId | undefined;
  readonly scopes: readonly string[];
}

export interface CallerDirectory {
  getCaller(driverId: DriverId): Promise<Caller | null>;
}
