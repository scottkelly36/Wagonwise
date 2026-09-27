import type { IdentityModule } from '../../identity/api.js';
import type { AdminDirectory } from '../application/ports/admin-directory.js';
import type { DriverId } from '../domain/company.js';

/** Adapter for the one cross-context read every companies route's admin check needs — same
 *  shape as hazards' own `IdentityAdminDirectory`. `driverId` needs no re-branding through
 *  `makeId`: companies' own `DriverId` and identity's are the exact same nominal type (same brand
 *  name, decision 46), so a value from either side is already assignable to the other. */
export class IdentityAdminDirectory implements AdminDirectory {
  constructor(private readonly identity: Pick<IdentityModule, 'isDriverAdmin'>) {}

  isAdmin(driverId: DriverId): Promise<boolean> {
    return this.identity.isDriverAdmin(driverId);
  }
}
