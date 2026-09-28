import type { IdentityModule } from '../../identity/api.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import type { DriverId } from '../domain/vehicle.js';

/**
 * Adapter for the one cross-context read fleet's authorization checks need (AGENTS.md rule 7,
 * same shape as companies'/hazards' own `IdentityAdminDirectory`). `driverId`/`companyId` need no
 * re-branding through `makeId` — fleet's own types and identity's are the exact same nominal type
 * (same brand names, decision 46), so a value from either side is already assignable to the
 * other with no import between them.
 */
export class IdentityCallerDirectory implements CallerDirectory {
  constructor(private readonly identity: Pick<IdentityModule, 'getDriverAccess'>) {}

  async getCaller(driverId: DriverId): Promise<Caller | null> {
    const access = await this.identity.getDriverAccess(driverId);
    if (!access) return null;
    return {
      isAdmin: access.isAdmin,
      companyId: access.companyId,
      scopes: access.scopes,
    };
  }
}
