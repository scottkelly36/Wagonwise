import type { DriverId } from '../../domain/company.js';

/** The one cross-context read every companies route's admin gate needs (AGENTS.md rule 7) —
 *  companies owns this port with its own types, never importing identity's `Driver`/`DriverId`
 *  directly. Implemented by `infrastructure/identity-admin-directory.ts`, adapting identity's own
 *  `isDriverAdmin` read-model — same shape as hazards' own copy of this exact port. */
export interface AdminDirectory {
  isAdmin(driverId: DriverId): Promise<boolean>;
}
