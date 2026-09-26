import type { AdminDirectory } from '../ports/admin-directory.js';
import type { DriverId } from '../../domain/hazard-report.js';

/** A deterministic `AdminDirectory` test double — same role `StubHazardParser` plays for
 *  `HazardParser` (interface-layer tests must never import `infrastructure/` directly,
 *  AGENTS.md rule 5's `interface-no-infrastructure` check). Defaults to "nobody's an admin",
 *  the safer default for a route test that isn't specifically exercising the admin gate. */
export class StubAdminDirectory implements AdminDirectory {
  constructor(private readonly adminDriverIds: ReadonlySet<DriverId> = new Set()) {}

  isAdmin(driverId: DriverId): Promise<boolean> {
    return Promise.resolve(this.adminDriverIds.has(driverId));
  }
}
