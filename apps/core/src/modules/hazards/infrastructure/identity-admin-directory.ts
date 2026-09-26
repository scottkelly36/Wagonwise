import type { IdentityModule } from '../../identity/api.js';
import type { AdminDirectory } from '../application/ports/admin-directory.js';
import type { DriverId } from '../domain/hazard-report.js';

/**
 * Adapter for the one cross-context read `delete-hazard`'s admin check needs (design doc's rule
 * 7 pattern, same shape as routing's `HazardAvoidanceQueryAdapter` wrapping hazards' own facade).
 * `driverId` needs no re-branding through `makeId` — hazards' own `DriverId` (domain/
 * hazard-report.ts) and identity's are the exact same nominal type (same brand name, decision
 * 46), so a value from either side is already assignable to the other with no import between
 * them.
 */
export class IdentityAdminDirectory implements AdminDirectory {
  constructor(private readonly identity: Pick<IdentityModule, 'isDriverAdmin'>) {}

  isAdmin(driverId: DriverId): Promise<boolean> {
    return this.identity.isDriverAdmin(driverId);
  }
}
