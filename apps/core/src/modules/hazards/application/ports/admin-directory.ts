import type { DriverId } from '../../domain/hazard-report.js';

/** The one cross-context read `delete-hazard`'s admin gate needs (AGENTS.md rule 7) — hazards
 *  owns this port with its own types, never importing identity's `Driver`/`DriverId` directly.
 *  Implemented by `infrastructure/identity-admin-directory.ts`, adapting identity's own
 *  `isDriverAdmin` read-model. */
export interface AdminDirectory {
  isAdmin(driverId: DriverId): Promise<boolean>;
}
